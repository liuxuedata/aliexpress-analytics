// /api/site-configs/[id].js
// 站点配置的更新和删除API
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
  
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Site ID is required' });
  }

  const supabase = getClient();

  try {
    switch (req.method) {
      case 'PUT':
        // 更新站点配置
        const { name, platform, display_name, domain, data_source, template_id, config_json } = req.body;

        // 验证必填字段
        if (!name || !platform || !display_name || !data_source) {
          return res.status(400).json({
            ok: false,
            error: 'Missing required fields: name, platform, display_name, data_source'
          });
        }

        // 更新站点配置
        const { data: updatedSite, error: updateError } = await supabase
          .from('site_configs')
          .update({
            name,
            platform,
            display_name,
            domain,
            data_source,
            template_id,
            config_json,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single();

        if (updateError) throw updateError;

        if (!updatedSite) {
          return res.status(404).json({
            ok: false,
            error: 'Site not found'
          });
        }

        return res.status(200).json({
          ok: true,
          data: updatedSite
        });

      case 'DELETE':
        // 删除站点配置
        const { error: deleteError } = await supabase
          .from('site_configs')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;

        return res.status(200).json({
          ok: true,
          message: 'Site deleted successfully'
        });

      default:
        return res.status(405).json({
          ok: false,
          error: 'Method not allowed'
        });
    }
  } catch (error) {
    console.error('Site config API error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
