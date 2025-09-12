// 测试网络连接和DNS解析
export default async function handler(req, res) {
  try {
    console.log('[Network Test] Starting network connectivity test...');
    
    const tests = [];
    
    // 测试1: 基本网络连接
    try {
      console.log('[Network Test] Testing basic internet connectivity...');
      const response = await fetch('https://httpbin.org/get', {
        method: 'GET',
        timeout: 10000
      });
      tests.push({
        name: 'Basic Internet',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'Internet connection working' : 'Internet connection failed'
      });
    } catch (error) {
      tests.push({
        name: 'Basic Internet',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试2: Amazon域名解析
    try {
      console.log('[Network Test] Testing Amazon domain resolution...');
      const response = await fetch('https://api.amazon.com', {
        method: 'GET',
        timeout: 10000
      });
      tests.push({
        name: 'Amazon API Domain',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'Amazon API domain reachable' : 'Amazon API domain not reachable'
      });
    } catch (error) {
      tests.push({
        name: 'Amazon API Domain',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试3: SP-API域名解析
    try {
      console.log('[Network Test] Testing SP-API domain resolution...');
      const response = await fetch('https://sellingpartnerapi-us-east-1.amazon.com', {
        method: 'GET',
        timeout: 10000
      });
      tests.push({
        name: 'SP-API Domain',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'SP-API domain reachable' : 'SP-API domain not reachable'
      });
    } catch (error) {
      tests.push({
        name: 'SP-API Domain',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试4: 环境信息
    const envInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      userAgent: req.headers['user-agent'] || 'Unknown',
      region: process.env.VERCEL_REGION || 'Unknown',
      environment: process.env.NODE_ENV || 'Unknown'
    };
    
    // 测试5: 环境变量检查
    const envVars = {
      AMZ_LWA_CLIENT_ID: process.env.AMZ_LWA_CLIENT_ID ? 'SET' : 'MISSING',
      AMZ_LWA_CLIENT_SECRET: process.env.AMZ_LWA_CLIENT_SECRET ? 'SET' : 'MISSING',
      AMZ_SP_REFRESH_TOKEN: process.env.AMZ_SP_REFRESH_TOKEN ? 'SET' : 'MISSING',
      AMZ_APP_REGION: process.env.AMZ_APP_REGION || 'us-east-1',
      AMZ_MARKETPLACE_IDS: process.env.AMZ_MARKETPLACE_IDS ? 'SET' : 'MISSING'
    };
    
    return res.status(200).json({
      ok: true,
      message: 'Network connectivity test completed',
      timestamp: new Date().toISOString(),
      environment: envInfo,
      environmentVariables: envVars,
      tests: tests,
      summary: {
        totalTests: tests.length,
        passedTests: tests.filter(t => t.status === 'SUCCESS').length,
        failedTests: tests.filter(t => t.status === 'FAILED').length
      }
    });
    
  } catch (error) {
    console.error('[Network Test] Error:', error);
    return res.status(500).json({
      error: 'Network test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
