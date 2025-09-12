// 直接使用LWA token进行SP-API调用，不依赖AWS STS
export default async function handler(req, res) {
  try {
    console.log('[SP-API Direct] Starting direct SP-API call...');
    
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
    
    console.log('[SP-API Direct] Environment variables OK');
    console.log('[SP-API Direct] App Region:', appRegion);
    console.log('[SP-API Direct] Marketplace IDs:', marketplaceIds);
    
    // 步骤1: 获取LWA访问令牌
    console.log('[SP-API Direct] Getting LWA access token...');
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
    const accessToken = authData.access_token;
    console.log('[SP-API Direct] LWA authentication successful');
    
    // 步骤2: 测试SP-API端点连接
    const spApiBaseUrl = `https://sellingpartnerapi-${appRegion}.amazon.com`;
    const testEndpoint = '/sellers/v1/marketplaceParticipations';
    
    console.log('[SP-API Direct] Testing SP-API endpoint...');
    console.log('[SP-API Direct] URL:', `${spApiBaseUrl}${testEndpoint}`);
    
    try {
      const response = await fetch(`${spApiBaseUrl}${testEndpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Amazon-SP-API-Client/1.0'
        },
      });
      
      console.log('[SP-API Direct] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[SP-API Direct] SP-API call successful');
        
        return res.status(200).json({
          ok: true,
          message: 'SP-API direct call successful',
          data: data,
          endpoint: `${spApiBaseUrl}${testEndpoint}`,
          status: response.status
        });
      } else {
        const errorText = await response.text();
        console.error('[SP-API Direct] SP-API call failed:', errorText);
        
        return res.status(500).json({
          error: 'SP-API call failed',
          status: response.status,
          details: errorText,
          endpoint: `${spApiBaseUrl}${testEndpoint}`
        });
      }
      
    } catch (fetchError) {
      console.error('[SP-API Direct] Fetch error:', fetchError);
      
      return res.status(500).json({
        error: 'SP-API fetch failed',
        message: fetchError.message,
        endpoint: `${spApiBaseUrl}${testEndpoint}`,
        possibleCauses: [
          'Network connectivity issues',
          'DNS resolution problems',
          'Amazon API endpoint not accessible from Vercel',
          'Missing AWS signature requirements'
        ]
      });
    }
    
  } catch (error) {
    console.error('[SP-API Direct] Error:', error);
    return res.status(500).json({
      error: 'SP-API direct call failed',
      message: error.message,
      stack: error.stack
    });
  }
}
