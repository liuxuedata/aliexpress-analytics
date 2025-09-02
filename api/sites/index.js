// /api/sites/index.js
// 站点基本信息API（作为备选方案）
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    
    // 获取所有站点
    const { data: sites, error } = await supabase
      .from('sites')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取sites表数据失败:', error);
      return res.status(500).json({ 
        ok: false, 
        error: error.message 
      });
    }

    return res.status(200).json({
      ok: true,
      data: sites || []
    });

  } catch (error) {
    console.error('sites API错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
