// /api/site-configs/update.js
// 专门处理站点更新的API
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  console.log('更新API请求信息:', {
    method: req.method,
    url: req.url,
    body: req.body
  });
  
  const { siteId, ...updateData } = req.body;
  console.log('要更新的站点ID:', siteId);
  console.log('更新数据:', updateData);
  
  if (!siteId) {
    console.log('站点ID为空，返回错误');
    return res.status(400).json({ error: 'Site ID is required' });
  }

  const { name, platform, display_name, domain, data_source, template_id, config_json } = updateData;

  // 验证必填字段
  if (!name || !platform || !display_name || !data_source) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: name, platform, display_name, data_source'
    });
  }

  const supabase = getClient();

  try {
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
      .eq('id', siteId)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!updatedSite) {
      return res.status(404).json({
        ok: false,
        error: 'Site not found'
      });
    }

    console.log('站点更新成功:', siteId);
    return res.status(200).json({
      ok: true,
      data: updatedSite
    });
  } catch (error) {
    console.error('更新站点错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
