// /api/site-configs/delete.js
// 专门处理站点删除的API
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
  
  console.log('删除API请求信息:', {
    method: req.method,
    url: req.url,
    body: req.body
  });
  
  const { siteId } = req.body;
  console.log('要删除的站点ID:', siteId);
  
  if (!siteId) {
    console.log('站点ID为空，返回错误');
    return res.status(400).json({ error: 'Site ID is required' });
  }

  const supabase = getClient();

  try {
    // 删除站点配置
    const { error: deleteError } = await supabase
      .from('site_configs')
      .delete()
      .eq('id', siteId);

    if (deleteError) throw deleteError;

    console.log('站点删除成功:', siteId);
    return res.status(200).json({
      ok: true,
      message: 'Site deleted successfully'
    });
  } catch (error) {
    console.error('删除站点错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
