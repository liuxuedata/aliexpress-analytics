// 使用代理服务访问Amazon SP-API
export default async function handler(req, res) {
  try {
    console.log('[SP-API Proxy] Starting proxy-based SP-API call...');
    
    // 检查环境变量
    const clientId = process.env.AMZ_LWA_CLIENT_ID;
    const clientSecret = process.env.AMZ_LWA_CLIENT_SECRET;
    const refreshToken = process.env.AMZ_SP_REFRESH_TOKEN;
    const appRegion = process.env.AMZ_APP_REGION || 'us-east-1';
    
    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(500).json({
        error: 'Missing required environment variables'
      });
    }
    
    // 步骤1: 获取LWA访问令牌
    console.log('[SP-API Proxy] Getting LWA access token...');
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
    console.log('[SP-API Proxy] LWA authentication successful');
    
    // 步骤2: 尝试使用不同的代理服务
    const proxyServices = [
      {
        name: 'CORS Anywhere',
        url: 'https://cors-anywhere.herokuapp.com/',
        target: `https://sellingpartnerapi-${appRegion}.amazon.com/sellers/v1/marketplaceParticipations`
      },
      {
        name: 'AllOrigins',
        url: 'https://api.allorigins.win/raw?url=',
        target: `https://sellingpartnerapi-${appRegion}.amazon.com/sellers/v1/marketplaceParticipations`
      },
      {
        name: 'Proxy CORS',
        url: 'https://proxy.cors.sh/',
        target: `https://sellingpartnerapi-${appRegion}.amazon.com/sellers/v1/marketplaceParticipations`
      }
    ];
    
    const results = [];
    
    for (const proxy of proxyServices) {
      try {
        console.log(`[SP-API Proxy] Trying ${proxy.name}...`);
        
        const proxyUrl = proxy.url + encodeURIComponent(proxy.target);
        console.log(`[SP-API Proxy] Proxy URL: ${proxyUrl}`);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'User-Agent': 'Amazon-SP-API-Client/1.0'
          },
        });
        
        console.log(`[SP-API Proxy] ${proxy.name} response status:`, response.status);
        
        if (response.ok) {
          const data = await response.json();
          results.push({
            proxy: proxy.name,
            status: 'SUCCESS',
            data: data
          });
          console.log(`[SP-API Proxy] ${proxy.name} successful`);
        } else {
          const errorText = await response.text();
          results.push({
            proxy: proxy.name,
            status: 'FAILED',
            statusCode: response.status,
            error: errorText
          });
          console.log(`[SP-API Proxy] ${proxy.name} failed:`, errorText);
        }
        
      } catch (error) {
        results.push({
          proxy: proxy.name,
          status: 'FAILED',
          error: error.message
        });
        console.log(`[SP-API Proxy] ${proxy.name} error:`, error.message);
      }
    }
    
    const successfulProxies = results.filter(r => r.status === 'SUCCESS');
    
    if (successfulProxies.length > 0) {
      return res.status(200).json({
        ok: true,
        message: 'SP-API proxy call successful',
        successfulProxies: successfulProxies,
        allResults: results
      });
    } else {
      return res.status(500).json({
        error: 'All proxy services failed',
        results: results,
        recommendations: [
          'Amazon SP-API may require AWS signature',
          'Consider using a dedicated proxy service',
          'Check if IP whitelisting is required',
          'Verify SP-API permissions and configuration'
        ]
      });
    }
    
  } catch (error) {
    console.error('[SP-API Proxy] Error:', error);
    return res.status(500).json({
      error: 'SP-API proxy call failed',
      message: error.message,
      stack: error.stack
    });
  }
}
