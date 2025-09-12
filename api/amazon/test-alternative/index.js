// 测试替代的Amazon API访问方法
export default async function handler(req, res) {
  try {
    console.log('[Alternative Test] Testing alternative Amazon API access methods...');
    
    const tests = [];
    
    // 测试1: 使用不同的User-Agent
    try {
      console.log('[Alternative Test] Testing with different User-Agent...');
      const response = await fetch('https://api.amazon.com', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      tests.push({
        name: 'Amazon API with Browser User-Agent',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'Browser User-Agent working' : 'Browser User-Agent failed'
      });
    } catch (error) {
      tests.push({
        name: 'Amazon API with Browser User-Agent',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试2: 使用不同的SP-API端点
    try {
      console.log('[Alternative Test] Testing different SP-API endpoints...');
      const endpoints = [
        'https://sellingpartnerapi-us-east-1.amazon.com',
        'https://sellingpartnerapi-eu-west-1.amazon.com',
        'https://sellingpartnerapi-ap-northeast-1.amazon.com'
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'User-Agent': 'Amazon-SP-API-Client/1.0',
              'Accept': 'application/json'
            }
          });
          
          tests.push({
            name: `SP-API Endpoint: ${endpoint}`,
            status: response.ok ? 'SUCCESS' : 'FAILED',
            statusCode: response.status,
            details: response.ok ? 'Endpoint reachable' : 'Endpoint not reachable'
          });
        } catch (error) {
          tests.push({
            name: `SP-API Endpoint: ${endpoint}`,
            status: 'FAILED',
            error: error.message
          });
        }
      }
    } catch (error) {
      tests.push({
        name: 'SP-API Endpoint Test',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试3: 使用不同的请求方法
    try {
      console.log('[Alternative Test] Testing different request methods...');
      const methods = ['GET', 'POST', 'HEAD'];
      
      for (const method of methods) {
        try {
          const response = await fetch('https://api.amazon.com', {
            method: method,
            headers: {
              'User-Agent': 'Amazon-SP-API-Client/1.0',
              'Accept': 'application/json'
            }
          });
          
          tests.push({
            name: `Amazon API with ${method} method`,
            status: response.ok ? 'SUCCESS' : 'FAILED',
            statusCode: response.status,
            details: response.ok ? `${method} method working` : `${method} method failed`
          });
        } catch (error) {
          tests.push({
            name: `Amazon API with ${method} method`,
            status: 'FAILED',
            error: error.message
          });
        }
      }
    } catch (error) {
      tests.push({
        name: 'Request Method Test',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试4: 检查Vercel环境限制
    const vercelInfo = {
      region: process.env.VERCEL_REGION,
      environment: process.env.NODE_ENV,
      vercelUrl: process.env.VERCEL_URL,
      vercelEnv: process.env.VERCEL_ENV,
      nodeVersion: process.version,
      platform: process.platform
    };
    
    return res.status(200).json({
      ok: true,
      message: 'Alternative Amazon API access test completed',
      timestamp: new Date().toISOString(),
      vercelInfo: vercelInfo,
      tests: tests,
      summary: {
        totalTests: tests.length,
        passedTests: tests.filter(t => t.status === 'SUCCESS').length,
        failedTests: tests.filter(t => t.status === 'FAILED').length
      },
      recommendations: [
        'If all tests fail, Amazon may be blocking Vercel IP ranges',
        'Consider using a proxy service or different hosting platform',
        'Check if Amazon SP-API requires whitelisted IP addresses',
        'Verify if AWS credentials are properly configured for SP-API access'
      ]
    });
    
  } catch (error) {
    console.error('[Alternative Test] Error:', error);
    return res.status(500).json({
      error: 'Alternative test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
