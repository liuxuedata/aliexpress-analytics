const { createClient } = require('@supabase/supabase-js');

function getClient(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if(!url || !key) throw new Error('Supabase env not configured');
  return createClient(url,key);
}

module.exports = async (req,res) => {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('independent_landing_metrics')
      .select('site', { distinct: true })
      .order('site', { ascending: true });
    if (error) throw error;
    const sites = (data || []).map(r => r.site).filter(Boolean);
    res.status(200).json({ ok: true, sites });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
