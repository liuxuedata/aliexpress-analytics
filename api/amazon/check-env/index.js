// 检查Amazon SP-API环境变量配置
export default async function handler(req, res) {
  const envVars = {
    AMZ_LWA_CLIENT_ID: process.env.AMZ_LWA_CLIENT_ID ? 'SET' : 'MISSING',
    AMZ_LWA_CLIENT_SECRET: process.env.AMZ_LWA_CLIENT_SECRET ? 'SET' : 'MISSING',
    AMZ_SP_REFRESH_TOKEN: process.env.AMZ_SP_REFRESH_TOKEN ? 'SET' : 'MISSING',
    AMZ_ROLE_ARN: process.env.AMZ_ROLE_ARN ? 'SET' : 'MISSING',
    AMZ_APP_REGION: process.env.AMZ_APP_REGION || 'us-east-1',
    AMZ_MARKETPLACE_IDS: process.env.AMZ_MARKETPLACE_IDS || 'MISSING',
    SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    AMZ_TABLE_NAME: process.env.AMZ_TABLE_NAME || 'amazon_daily_by_asin'
  };

  // 检查关键环境变量
  const missingVars = Object.entries(envVars)
    .filter(([key, value]) => value === 'MISSING')
    .map(([key]) => key);

  // 测试SP-API认证
  let authTest = { status: 'NOT_TESTED' };
  if (envVars.AMZ_LWA_CLIENT_ID === 'SET' && 
      envVars.AMZ_LWA_CLIENT_SECRET === 'SET' && 
      envVars.AMZ_SP_REFRESH_TOKEN === 'SET') {
    
    try {
      console.log('[Check Env] Testing SP-API authentication...');
      
      const response = await fetch('https://api.amazon.com/auth/o2/token', {
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

      if (response.ok) {
        const data = await response.json();
        authTest = {
          status: 'SUCCESS',
          hasAccessToken: !!data.access_token,
          expiresIn: data.expires_in
        };
      } else {
        const errorText = await response.text();
        authTest = {
          status: 'FAILED',
          statusCode: response.status,
          error: errorText
        };
      }
    } catch (error) {
      authTest = {
        status: 'ERROR',
        error: error.message
      };
    }
  } else {
    authTest = {
      status: 'SKIPPED',
      reason: 'Missing required environment variables'
    };
  }

  return res.status(200).json({
    ok: true,
    environment: envVars,
    missingVariables: missingVars,
    authTest: authTest,
    summary: {
      allVarsSet: missingVars.length === 0,
      authWorking: authTest.status === 'SUCCESS'
    }
  });
}
