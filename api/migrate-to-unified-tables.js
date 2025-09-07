// /api/migrate-to-unified-tables.js
// 数据迁移API：将现有站点专用表数据迁移到统一表
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    const { action, siteId } = req.body;

    if (action === 'migrate_facebook_ads') {
      // 迁移Facebook Ads数据
      const result = await migrateFacebookAdsData(supabase, siteId);
      return res.json(result);
    } else if (action === 'create_unified_tables') {
      // 创建统一表
      const result = await createUnifiedTables(supabase);
      return res.json(result);
    } else if (action === 'migrate_all') {
      // 迁移所有数据
      const result = await migrateAllData(supabase);
      return res.json(result);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.toString()
    });
  }
}

// 创建统一表
async function createUnifiedTables(supabase) {
  try {
    console.log('开始创建统一表...');
    
    // 创建Facebook Ads统一表
    const { error: fbTableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.independent_facebook_ads_daily (
          id bigserial NOT NULL,
          site text NOT NULL,
          day date NOT NULL,
          campaign_name text NOT NULL,
          adset_name text NOT NULL,
          landing_url text,
          impressions bigint DEFAULT 0,
          clicks bigint DEFAULT 0,
          spend_usd numeric(14,4) DEFAULT 0,
          cpm numeric(10,4) DEFAULT 0,
          cpc_all numeric(10,4) DEFAULT 0,
          all_ctr numeric(10,6) DEFAULT 0,
          reach bigint DEFAULT 0,
          frequency numeric(10,4) DEFAULT 0,
          all_clicks bigint DEFAULT 0,
          link_clicks bigint DEFAULT 0,
          link_ctr numeric(10,6) DEFAULT 0,
          ic_web bigint DEFAULT 0,
          ic_meta bigint DEFAULT 0,
          ic_total bigint DEFAULT 0,
          atc_web bigint DEFAULT 0,
          atc_meta bigint DEFAULT 0,
          atc_total bigint DEFAULT 0,
          purchase_web bigint DEFAULT 0,
          purchase_meta bigint DEFAULT 0,
          cpa_purchase_web numeric(10,4) DEFAULT 0,
          conversion_value numeric(14,4) DEFAULT 0,
          row_start_date date,
          row_end_date date,
          inserted_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now(),
          
          CONSTRAINT independent_facebook_ads_daily_pkey PRIMARY KEY (id),
          CONSTRAINT independent_facebook_ads_daily_uniq UNIQUE (
            site, day, campaign_name, adset_name
          )
        );
      `
    });

    if (fbTableError) {
      console.error('创建Facebook Ads表失败:', fbTableError);
      throw fbTableError;
    }

    // 创建索引
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_ind_fb_site_day 
        ON public.independent_facebook_ads_daily (site, day);
        
        CREATE INDEX IF NOT EXISTS idx_ind_fb_site_campaign 
        ON public.independent_facebook_ads_daily (site, campaign_name);
        
        CREATE INDEX IF NOT EXISTS idx_ind_fb_site_adset 
        ON public.independent_facebook_ads_daily (site, adset_name);
      `
    });

    console.log('统一表创建完成');
    return {
      ok: true,
      message: '统一表创建成功',
      tables: ['independent_facebook_ads_daily']
    };

  } catch (error) {
    console.error('创建统一表失败:', error);
    throw error;
  }
}

// 迁移Facebook Ads数据
async function migrateFacebookAdsData(supabase, siteId) {
  try {
    console.log('开始迁移Facebook Ads数据...');
    
    // 检查源表是否存在
    const { data: tableExists } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'independent_icyberite_facebook_ads_daily'
        );
      `
    });

    if (!tableExists) {
      return {
        ok: false,
        message: '源表 independent_icyberite_facebook_ads_daily 不存在',
        migrated: 0
      };
    }

    // 迁移数据
    const { data: migratedData, error: migrateError } = await supabase.rpc('exec_sql', {
      sql: `
        INSERT INTO public.independent_facebook_ads_daily (
          site, day, campaign_name, adset_name, landing_url,
          impressions, clicks, spend_usd, cpm, cpc_all, all_ctr,
          reach, frequency, all_clicks, link_clicks, link_ctr,
          ic_web, ic_meta, ic_total, atc_web, atc_meta, atc_total,
          purchase_web, purchase_meta, cpa_purchase_web, conversion_value,
          row_start_date, row_end_date, inserted_at, updated_at
        )
        SELECT 
          site, day, campaign_name, adset_name, landing_url,
          impressions, clicks, spend_usd, cpm, cpc_all, all_ctr,
          reach, frequency, all_clicks, link_clicks, link_ctr,
          ic_web, ic_meta, ic_total, atc_web, atc_meta, atc_total,
          purchase_web, purchase_meta, cpa_purchase_web, conversion_value,
          row_start_date, row_end_date, created_at, updated_at
        FROM public.independent_icyberite_facebook_ads_daily
        ON CONFLICT (site, day, campaign_name, adset_name) DO NOTHING;
      `
    });

    if (migrateError) {
      console.error('数据迁移失败:', migrateError);
      throw migrateError;
    }

    // 获取迁移统计
    const { data: stats } = await supabase
      .from('independent_facebook_ads_daily')
      .select('site, day', { count: 'exact' })
      .eq('site', siteId || 'independent_icyberite');

    console.log('Facebook Ads数据迁移完成');
    return {
      ok: true,
      message: 'Facebook Ads数据迁移成功',
      migrated: stats?.length || 0,
      site: siteId || 'independent_icyberite'
    };

  } catch (error) {
    console.error('迁移Facebook Ads数据失败:', error);
    throw error;
  }
}

// 迁移所有数据
async function migrateAllData(supabase) {
  try {
    console.log('开始迁移所有数据...');
    
    const results = [];
    
    // 1. 创建统一表
    const createResult = await createUnifiedTables(supabase);
    results.push(createResult);
    
    // 2. 迁移Facebook Ads数据
    const fbResult = await migrateFacebookAdsData(supabase);
    results.push(fbResult);
    
    // 3. 获取最终统计
    const { data: finalStats } = await supabase
      .from('independent_facebook_ads_daily')
      .select('site', { count: 'exact' });

    console.log('所有数据迁移完成');
    return {
      ok: true,
      message: '所有数据迁移成功',
      results: results,
      finalStats: {
        totalRecords: finalStats?.length || 0,
        sites: [...new Set(finalStats?.map(s => s.site) || [])]
      }
    };

  } catch (error) {
    console.error('迁移所有数据失败:', error);
    throw error;
  }
}
