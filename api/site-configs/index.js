// /api/site-configs/index.js
// 站点配置管理API
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const supabase = getClient();

  try {
    switch (req.method) {
      case 'GET':
        // 获取站点配置列表
        const { data: sites, error: sitesError } = await supabase
          .from('site_configs')
          .select('*')
          .order('created_at', { ascending: false });

        if (sitesError) throw sitesError;

        return res.status(200).json({
          ok: true,
          data: sites
        });

      case 'POST':
        // 创建新站点配置
        const { name, platform, display_name, domain, data_source, template_id, config_json } = req.body;

        // 验证必填字段
        if (!name || !platform || !display_name || !data_source) {
          return res.status(400).json({
            ok: false,
            error: 'Missing required fields: name, platform, display_name, data_source'
          });
        }

        // 生成站点ID
        const siteId = `${platform}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        // 检查站点是否已存在
        const { data: existingSite } = await supabase
          .from('site_configs')
          .select('id')
          .eq('id', siteId)
          .single();

        if (existingSite) {
          return res.status(400).json({
            ok: false,
            error: 'Site already exists with this name'
          });
        }

        // 插入新站点配置
        const { data: newSite, error: insertError } = await supabase
          .from('site_configs')
          .insert({
            id: siteId,
            name,
            platform,
            display_name,
            domain,
            data_source,
            template_id,
            config_json
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // 如果是独立站且有模板，自动生成数据表
        if (platform === 'independent' && template_id) {
          try {
            // 获取模板信息
            const { data: template } = await supabase
              .from('data_source_templates')
              .select('*')
              .eq('id', template_id)
              .single();

            if (template) {
              // 生成数据表
              const tableName = await generateDataTable(siteId, data_source, template);
              console.log(`Generated data table: ${tableName}`);
            }
          } catch (tableError) {
            console.error('Failed to generate data table:', tableError);
            // 不阻止站点创建，只记录错误
          }
        }

        return res.status(201).json({
          ok: true,
          data: newSite
        });

      default:
        return res.status(405).json({
          ok: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('Site configs API error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

// 生成数据表的辅助函数
async function generateDataTable(siteId, sourceType, template) {
  const supabase = getClient();
  
  // 根据数据源类型生成表结构
  let tableSchema;
  
  if (sourceType === 'facebook_ads') {
    tableSchema = {
      columns: {
        site: "text not null",
        day: "date not null",
        campaign_name: "text",
        adset_name: "text",
        landing_url: "text",
        impressions: "integer",
        clicks: "integer",
        spend_usd: "numeric(10,2)",
        cpm: "numeric(10,2)",
        cpc_all: "numeric(10,2)",
        all_ctr: "numeric(10,4)",
        reach: "integer",
        frequency: "numeric(10,2)",
        all_clicks: "integer",
        link_clicks: "integer",
        ic_web: "integer",
        ic_meta: "integer",
        ic_total: "integer",
        atc_web: "integer",
        atc_meta: "integer",
        atc_total: "integer",
        purchase_web: "integer",
        purchase_meta: "integer",
        cpa_purchase_web: "numeric(10,2)",
        link_ctr: "numeric(10,4)",
        conversion_value: "numeric(10,2)",
        row_start_date: "date",
        row_end_date: "date"
      }
    };
  } else if (sourceType === 'google_ads') {
    tableSchema = {
      columns: {
        site: "text not null",
        landing_url: "text",
        campaign: "text",
        day: "date",
        network: "text",
        device: "text",
        clicks: "integer",
        impr: "integer",
        ctr: "numeric(10,4)",
        avg_cpc: "numeric(10,2)",
        cost: "numeric(10,2)",
        conversions: "integer",
        cost_per_conv: "numeric(10,2)"
      }
    };
  } else {
    // 默认表结构
    tableSchema = {
      columns: {
        site: "text not null",
        date: "date",
        data: "jsonb"
      }
    };
  }

  // 调用动态表生成函数
  const { data, error } = await supabase.rpc('generate_dynamic_table', {
    site_id: siteId,
    source_type: sourceType,
    table_schema: tableSchema
  });

  if (error) throw error;
  return data;
}
