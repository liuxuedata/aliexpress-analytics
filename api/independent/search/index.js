const { createClient } = require('@supabase/supabase-js');

function getClient(){
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Supabase env not configured');
  return createClient(url,key);
}

function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function aggregate(rows){
  const map = {};
  (rows||[]).forEach(r=>{
    const key = r.landing_path;
    if(!map[key]){
      map[key] = {
        landing_path: key,
        landing_url: r.landing_url,
        clicks:0, impr:0, cost:0, conversions:0, conv_value:0
      };
    }
    const m = map[key];
    m.clicks += safeNum(r.clicks);
    m.impr += safeNum(r.impr);
    m.cost += safeNum(r.cost);
    m.conversions += safeNum(r.conversions);
    m.conv_value += safeNum(r.conv_value);
  });
  return Object.values(map).map(m=>({
    ...m,
    ctr: m.impr>0 ? m.clicks/m.impr : 0,
    conv_rate: m.clicks>0 ? m.conversions/m.clicks : 0
  }));
}

module.exports = async (req,res) => {
  try{
    const { site, q, limit = '20' } = req.query;
    if(!site || !q) return res.status(400).json({ error: 'missing site or q param' });
    const supabase = getClient();
    const limitNum = Math.min(Number(limit) || 20, 100);
    const { data, error } = await supabase
      .from('independent_landing_metrics')
      .select('landing_path, landing_url, clicks, impr, cost, conversions, conv_value')
      .eq('site', site)
      .ilike('landing_path', `%${q}%`)
      .limit(1000);
    if(error) throw error;
    const items = aggregate(data).sort((a,b)=>b.clicks - a.clicks).slice(0, limitNum);
    res.status(200).json({ ok:true, items });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
};

module.exports._aggregate = aggregate;
