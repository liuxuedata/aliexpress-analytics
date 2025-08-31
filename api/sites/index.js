// /api/sites/index.js
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

module.exports = async (req, res) => {
  try {
    const supabase = getClient();
    
    if (req.method === 'GET') {
      // 获取站点列表
      const { platform } = req.query;
      let query = supabase.from('sites').select('*').eq('is_active', true);
      
      if (platform) {
        query = query.eq('platform', platform);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      return res.status(200).json({ data });
    }
    
    if (req.method === 'POST') {
      // 创建新站点
      const { name, platform, display_name } = req.body;
      
      if (!name || !platform || !display_name) {
        return res.status(400).json({ error: 'Missing required fields: name, platform, display_name' });
      }
      
      const id = `${platform}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      
      const { data, error } = await supabase
        .from('sites')
        .insert({
          id,
          name,
          platform,
          display_name,
          is_active: true
        })
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') { // 唯一约束冲突
          return res.status(409).json({ error: 'Site already exists' });
        }
        return res.status(500).json({ error: error.message });
      }
      
      return res.status(201).json({ data });
    }
    
    if (req.method === 'PUT') {
      // 更新站点
      const { id } = req.query;
      const { name, display_name, is_active } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Missing site id' });
      }
      
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (display_name !== undefined) updateData.display_name = display_name;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      const { data, error } = await supabase
        .from('sites')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      return res.status(200).json({ data });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Sites API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
