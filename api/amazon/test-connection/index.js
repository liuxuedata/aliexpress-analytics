// 测试Amazon SP-API基本连接
export default async function handler(req, res) {
  try {
    console.log('[Test Connection] Starting SP-API connection test...');
    
    // 检查环境变量
    const clientId = process.env.AMZ_LWA_CLIENT_ID;
    const clientSecret = process.env.AMZ_LWA_CLIENT_SECRET;
    const refreshToken = process.env.AMZ_SP_REFRESH_TOKEN;
    const appRegion = process.env.AMZ_APP_REGION || 'us-east-1';
    const marketplaceIds = (process.env.AMZ_MARKETPLACE_IDS || '').split(',').filter(Boolean);
    
    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(500).json({
        error: 'Missing required environment variables',
        missing: {
          clientId: !clientId,
          clientSecret: !clientSecret,
          refreshToken: !refreshToken
        }
      });
    }
    
    console.log('[Test Connection] Environment variables OK');
    console.log('[Test Connection] App Region:', appRegion);
    console.log('[Test Connection] Marketplace IDs:', marketplaceIds);
    
    // 测试LWA认证
    console.log('[Test Connection] Testing LWA authentication...');
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
    
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      return res.status(500).json({
        error: 'LWA authentication failed',
        status: authResponse.status,
        details: errorText
      });
    }
    
    const authData = await authResponse.json();
    console.log('[Test Connection] LWA authentication successful');
    
    // 测试SP-API端点连接
    const accessToken = authData.access_token;
    const spApiUrl = `https://sellingpartnerapi-${appRegion}.amazon.com`;
    
    console.log('[Test Connection] Testing SP-API endpoint connection...');
    console.log('[Test Connection] SP-API URL:', spApiUrl);
    
    // 尝试访问一个简单的SP-API端点
    const testResponse = await fetch(`${spApiUrl}/sellers/v1/marketplaceParticipations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-amz-access-token': accessToken,
      },
    });
    
    console.log('[Test Connection] SP-API test response status:', testResponse.status);
    
    let testResult = {};
    if (testResponse.ok) {
      testResult = await testResponse.json();
      console.log('[Test Connection] SP-API test successful');
    } else {
      const errorText = await testResponse.text();
      console.log('[Test Connection] SP-API test failed:', errorText);
      testResult = { error: errorText };
    }
    
    return res.status(200).json({
      ok: true,
      message: 'SP-API connection test completed',
      results: {
        environment: {
          appRegion,
          marketplaceIds,
          hasAccessToken: !!accessToken
        },
        lwaAuth: {
          status: 'SUCCESS',
          expiresIn: authData.expires_in
        },
        spApiTest: {
          status: testResponse.status,
          url: `${spApiUrl}/sellers/v1/marketplaceParticipations`,
          result: testResult
        }
      }
    });
    
  } catch (error) {
    console.error('[Test Connection] Error:', error);
    return res.status(500).json({
      error: 'Connection test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
