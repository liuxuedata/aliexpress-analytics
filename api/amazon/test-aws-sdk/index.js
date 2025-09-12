// 测试使用AWS SDK进行SP-API调用
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { createHash, createHmac } from 'crypto';

export default async function handler(req, res) {
  try {
    console.log('[AWS SDK Test] Starting AWS SDK test...');
    
    const tests = [];
    
    // 检查环境变量
    const clientId = process.env.AMZ_LWA_CLIENT_ID;
    const clientSecret = process.env.AMZ_LWA_CLIENT_SECRET;
    const refreshToken = process.env.AMZ_SP_REFRESH_TOKEN;
    const roleArn = process.env.AMZ_ROLE_ARN;
    const appRegion = process.env.AMZ_APP_REGION || 'us-east-1';
    
    if (!clientId || !clientSecret || !refreshToken || !roleArn) {
      return res.status(500).json({
        error: 'Missing required environment variables',
        missing: {
          clientId: !clientId,
          clientSecret: !clientSecret,
          refreshToken: !refreshToken,
          roleArn: !roleArn
        }
      });
    }
    
    // 测试1: LWA认证
    try {
      console.log('[AWS SDK Test] Testing LWA authentication...');
      const authResponse = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      
      if (authResponse.ok) {
        const authData = await authResponse.json();
        tests.push({
          name: 'LWA Authentication',
          status: 'SUCCESS',
          details: 'LWA authentication successful',
          expiresIn: authData.expires_in
        });
        
        // 测试2: AWS STS Assume Role
        try {
          console.log('[AWS SDK Test] Testing AWS STS Assume Role...');
          const stsClient = new STSClient({ region: appRegion });
          
          const assumeRoleCommand = new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: 'sp-api-session',
            DurationSeconds: 3600,
          });
          
          const stsResponse = await stsClient.send(assumeRoleCommand);
          
          tests.push({
            name: 'AWS STS Assume Role',
            status: 'SUCCESS',
            details: 'AWS STS Assume Role successful',
            accessKeyId: stsResponse.Credentials?.AccessKeyId ? 'SET' : 'MISSING',
            secretAccessKey: stsResponse.Credentials?.SecretAccessKey ? 'SET' : 'MISSING',
            sessionToken: stsResponse.Credentials?.SessionToken ? 'SET' : 'MISSING'
          });
          
          // 测试3: 使用AWS签名进行SP-API调用
          if (stsResponse.Credentials) {
            try {
              console.log('[AWS SDK Test] Testing SP-API with AWS signature...');
              
              const credentials = stsResponse.Credentials;
              const accessToken = authData.access_token;
              
              // 创建AWS签名
              const method = 'GET';
              const service = 'execute-api';
              const host = `sellingpartnerapi-${appRegion}.amazon.com`;
              const region = appRegion;
              const endpoint = '/sellers/v1/marketplaceParticipations';
              const url = `https://${host}${endpoint}`;
              
              const now = new Date();
              const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
              const dateStamp = amzDate.substr(0, 8);
              
              // 创建规范请求
              const canonicalHeaders = [
                `host:${host}`,
                `x-amz-access-token:${accessToken}`,
                `x-amz-date:${amzDate}`
              ].join('\n') + '\n';
              
              const signedHeaders = 'host;x-amz-access-token;x-amz-date';
              const payloadHash = createHash('sha256').update('').digest('hex');
              
              const canonicalRequest = [
                method,
                endpoint,
                '',
                canonicalHeaders,
                signedHeaders,
                payloadHash
              ].join('\n');
              
              // 创建签名字符串
              const algorithm = 'AWS4-HMAC-SHA256';
              const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
              const stringToSign = [
                algorithm,
                amzDate,
                credentialScope,
                createHash('sha256').update(canonicalRequest).digest('hex')
              ].join('\n');
              
              // 计算签名
              const getSignatureKey = (key, dateStamp, regionName, serviceName) => {
                const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
                const kRegion = createHmac('sha256', kDate).update(regionName).digest();
                const kService = createHmac('sha256', kRegion).update(serviceName).digest();
                const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
                return kSigning;
              };
              
              const signature = createHmac('sha256', 
                getSignatureKey(credentials.SecretAccessKey, dateStamp, region, service)
              ).update(stringToSign).digest('hex');
              
              // 创建授权头
              const authorizationHeader = `${algorithm} Credential=${credentials.AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
              
              // 发送请求
              const response = await fetch(url, {
                method: method,
                headers: {
                  'Authorization': authorizationHeader,
                  'x-amz-access-token': accessToken,
                  'x-amz-date': amzDate,
                  'Host': host
                }
              });
              
              tests.push({
                name: 'SP-API with AWS Signature',
                status: response.ok ? 'SUCCESS' : 'FAILED',
                statusCode: response.status,
                details: response.ok ? 'SP-API call successful' : 'SP-API call failed'
              });
              
            } catch (error) {
              tests.push({
                name: 'SP-API with AWS Signature',
                status: 'FAILED',
                error: error.message
              });
            }
          }
          
        } catch (error) {
          tests.push({
            name: 'AWS STS Assume Role',
            status: 'FAILED',
            error: error.message
          });
        }
        
      } else {
        tests.push({
          name: 'LWA Authentication',
          status: 'FAILED',
          statusCode: authResponse.status,
          error: 'LWA authentication failed'
        });
      }
      
    } catch (error) {
      tests.push({
        name: 'LWA Authentication',
        status: 'FAILED',
        error: error.message
      });
    }
    
    return res.status(200).json({
      ok: true,
      message: 'AWS SDK test completed',
      timestamp: new Date().toISOString(),
      tests: tests,
      summary: {
        totalTests: tests.length,
        passedTests: tests.filter(t => t.status === 'SUCCESS').length,
        failedTests: tests.filter(t => t.status === 'FAILED').length
      }
    });
    
  } catch (error) {
    console.error('[AWS SDK Test] Error:', error);
    return res.status(500).json({
      error: 'AWS SDK test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
