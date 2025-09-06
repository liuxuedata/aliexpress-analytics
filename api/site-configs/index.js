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

        // 统一表架构：不再需要为每个站点创建独立表
        // 所有站点共享通用表：
        // - Facebook Ads: independent_facebook_ads_daily
        // - Google Ads: independent_landing_metrics  
        // - TikTok Ads: independent_tiktok_ads_daily
        if (platform === 'independent') {
          const tableName = getUnifiedTableName(data_source);
          console.log(`站点 ${siteId} 将使用统一表: ${tableName}`);
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

// 获取统一表名的辅助函数
function getUnifiedTableName(dataSource) {
  const tableMapping = {
    'facebook_ads': 'independent_facebook_ads_daily',
    'google_ads': 'independent_landing_metrics',
    'tiktok_ads': 'independent_tiktok_ads_daily'
  };
  
  return tableMapping[dataSource] || 'independent_generic_daily';
}
