// Amazon API 调试端点
export default async function handler(req, res) {
  try {
    const debug = {
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_URL: process.env.VERCEL_URL
      },
      amazonEnvVars: {
        AMZ_LWA_CLIENT_ID: process.env.AMZ_LWA_CLIENT_ID ? 'SET' : 'MISSING',
        AMZ_LWA_CLIENT_SECRET: process.env.AMZ_LWA_CLIENT_SECRET ? 'SET' : 'MISSING',
        AMZ_SP_REFRESH_TOKEN: process.env.AMZ_SP_REFRESH_TOKEN ? 'SET' : 'MISSING',
        AMZ_ROLE_ARN: process.env.AMZ_ROLE_ARN ? 'SET' : 'MISSING',
        AMZ_MARKETPLACE_IDS: process.env.AMZ_MARKETPLACE_IDS ? 'SET' : 'MISSING',
        AMZ_APP_REGION: process.env.AMZ_APP_REGION || 'us-east-1',
        AMZ_TABLE_NAME: process.env.AMZ_TABLE_NAME || 'amazon_daily_by_asin'
      },
      supabaseEnvVars: {
        SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
      }
    };

    // 测试数据库连接
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
      
      debug.database = {
        status: error ? 'ERROR' : 'OK',
        error: error?.message || null,
        tableExists: !error
      };
    } catch (dbError) {
      debug.database = {
        status: 'ERROR',
        error: dbError.message,
        tableExists: false
      };
    }

    return res.status(200).json({
      ok: true,
      debug
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack
    });
  }
}
