// /api/create-unified-table.js
// 强制创建统一Facebook Ads表
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    
    console.log('开始创建统一Facebook Ads表...');

    // 1. 删除现有表（如果存在）
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'DROP TABLE IF EXISTS public.independent_facebook_ads_daily CASCADE;'
    });

    if (dropError) {
      console.warn('删除现有表时出现警告:', dropError);
    }

    // 2. 创建新表
    const createTableSQL = `
      CREATE TABLE public.independent_facebook_ads_daily (
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
    `;

    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: createTableSQL
    });

    if (createError) {
      console.error('创建表失败:', createError);
      return res.status(500).json({ 
        error: 'Failed to create table', 
        details: createError.message 
      });
    }

    console.log('表创建成功，开始创建索引...');

    // 3. 创建索引
    const indexSQLs = [
      'CREATE INDEX IF NOT EXISTS idx_ind_fb_site_day ON public.independent_facebook_ads_daily (site, day);',
      'CREATE INDEX IF NOT EXISTS idx_ind_fb_site_campaign ON public.independent_facebook_ads_daily (site, campaign_name);',
      'CREATE INDEX IF NOT EXISTS idx_ind_fb_site_adset ON public.independent_facebook_ads_daily (site, adset_name);',
      'CREATE INDEX IF NOT EXISTS idx_ind_fb_site_date_range ON public.independent_facebook_ads_daily (site, day, campaign_name);'
    ];

    for (const indexSQL of indexSQLs) {
      const { error: indexError } = await supabase.rpc('exec_sql', {
        sql: indexSQL
      });
      
      if (indexError) {
        console.warn('创建索引时出现警告:', indexError);
      }
    }

    console.log('索引创建完成，验证表结构...');

    // 4. 验证表结构
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', 'independent_facebook_ads_daily')
      .order('ordinal_position');

    if (columnError) {
      console.error('验证表结构失败:', columnError);
      return res.status(500).json({ 
        error: 'Failed to verify table structure', 
        details: columnError.message 
      });
    }

    const columnNames = columns.map(col => col.column_name);
    const hasInsertedAt = columnNames.includes('inserted_at');
    const hasUpdatedAt = columnNames.includes('updated_at');

    console.log('表创建和验证完成');

    return res.status(200).json({
      success: true,
      message: 'Unified Facebook Ads table created successfully',
      tableName: 'independent_facebook_ads_daily',
      columns: columns,
      columnCount: columns.length,
      keyFields: {
        inserted_at: hasInsertedAt,
        updated_at: hasUpdatedAt
      },
      allFieldsPresent: hasInsertedAt && hasUpdatedAt
    });

  } catch (error) {
    console.error('创建统一表错误:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
