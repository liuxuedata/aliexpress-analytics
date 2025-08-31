const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

module.exports = async (req, res) => {
  const supabase = getClient();
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sites')
        .select('id,name,created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.status(200).json({ sites: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }
  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('sites')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      res.status(200).json({ site: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }
  res.setHeader('Allow', 'GET,POST');
  res.status(405).json({ error: 'Method Not Allowed' });
};
