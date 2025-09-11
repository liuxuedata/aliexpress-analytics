// Amazon API 集成测试
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const testResults = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    // 测试1: 环境变量检查
    console.log('[Test] Checking environment variables...');
    const requiredEnvVars = [
      'AMZ_LWA_CLIENT_ID',
      'AMZ_LWA_CLIENT_SECRET', 
      'AMZ_SP_REFRESH_TOKEN',
      'AMZ_ROLE_ARN',
      'AMZ_MARKETPLACE_IDS',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    testResults.tests.push({
      name: 'Environment Variables',
      status: missingVars.length === 0 ? 'PASS' : 'FAIL',
      details: missingVars.length === 0 ? 'All required environment variables are set' : `Missing: ${missingVars.join(', ')}`
    });

    // 测试2: 数据库连接测试
    console.log('[Test] Testing database connection...');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      
      const { data, error } = await supabase
        .from('amazon_daily_by_asin')
        .select('count')
        .limit(1);
      
      testResults.tests.push({
        name: 'Database Connection',
        status: error ? 'FAIL' : 'PASS',
        details: error ? `Database error: ${error.message}` : 'Database connection successful'
      });
    } catch (dbError) {
      testResults.tests.push({
        name: 'Database Connection',
        status: 'FAIL',
        details: `Database connection failed: ${dbError.message}`
      });
    }

    // 测试3: API端点测试
    console.log('[Test] Testing API endpoints...');
    
    // 测试 query API
    try {
      const queryResponse = await fetch(`${baseUrl}/api/amazon/query?start=2025-01-01&end=2025-01-02&granularity=day`);
      const queryData = await queryResponse.json();
      
      testResults.tests.push({
        name: 'Query API',
        status: queryResponse.ok ? 'PASS' : 'FAIL',
        details: queryResponse.ok ? `Query API working, returned ${queryData.rows?.length || 0} rows` : `Query API error: ${queryData.error || 'Unknown error'}`
      });
    } catch (queryError) {
      testResults.tests.push({
        name: 'Query API',
        status: 'FAIL',
        details: `Query API failed: ${queryError.message}`
      });
    }

    // 测试 upsert API
    try {
      const testData = [{
        marketplace_id: 'ATVPDKIKX0DER',
        asin: 'TEST123456789',
        stat_date: '2025-01-01',
        sessions: 100,
        page_views: 250,
        units_ordered: 5,
        ordered_product_sales: 99.99,
        buy_box_pct: 0.85
      }];

      const upsertResponse = await fetch(`${baseUrl}/api/amazon/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: testData })
      });
      
      const upsertData = await upsertResponse.json();
      
      testResults.tests.push({
        name: 'Upsert API',
        status: upsertResponse.ok ? 'PASS' : 'FAIL',
        details: upsertResponse.ok ? `Upsert API working, upserted ${upsertData.upserted || 0} rows` : `Upsert API error: ${upsertData.error || 'Unknown error'}`
      });
    } catch (upsertError) {
      testResults.tests.push({
        name: 'Upsert API',
        status: 'FAIL',
        details: `Upsert API failed: ${upsertError.message}`
      });
    }

    // 测试4: SP-API 认证测试（仅测试token获取）
    console.log('[Test] Testing SP-API authentication...');
    try {
      const tokenResponse = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: process.env.AMZ_SP_REFRESH_TOKEN,
          client_id: process.env.AMZ_LWA_CLIENT_ID,
          client_secret: process.env.AMZ_LWA_CLIENT_SECRET,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      testResults.tests.push({
        name: 'SP-API Authentication',
        status: tokenResponse.ok ? 'PASS' : 'FAIL',
        details: tokenResponse.ok ? 'SP-API authentication successful' : `SP-API auth error: ${tokenData.error_description || 'Unknown error'}`
      });
    } catch (authError) {
      testResults.tests.push({
        name: 'SP-API Authentication',
        status: 'FAIL',
        details: `SP-API authentication failed: ${authError.message}`
      });
    }

    // 计算总体状态
    const passedTests = testResults.tests.filter(test => test.status === 'PASS').length;
    const totalTests = testResults.tests.length;
    const overallStatus = passedTests === totalTests ? 'PASS' : 'FAIL';

    return res.status(200).json({
      ok: true,
      overallStatus,
      summary: `${passedTests}/${totalTests} tests passed`,
      testResults
    });

  } catch (error) {
    console.error('[Test] Integration test failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'Integration test failed',
      details: error.message,
      testResults
    });
  }
}
