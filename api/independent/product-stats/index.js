const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  if (d && !isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return fallback;
}

function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n)?n:0;
}

function extractName(path) {
  const p = path || '';
  const seg = p.split('/').filter(Boolean).pop();
  const name = seg ? decodeURIComponent(seg) : '';
  return name || decodeURIComponent(p);
}

function lastWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((dow + 6) % 7));
  const from = new Date(mondayThisWeek);
  from.setDate(mondayThisWeek.getDate() - 7);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) };
}

function dayDiff(a,b){
  return Math.round((new Date(b) - new Date(a))/86400000) + 1;
}

async function getSeriesWithSnapshot(supabase, site, product, fromDate, toDate){
  console.log('getSeriesWithSnapshot', { site, product, fromDate, toDate });
  const needed = dayDiff(fromDate, toDate);
  const { data: snap, error: snapErr } = await supabase
    .from('indep_product_snapshot')
    .select('day, clicks, impr, conversions, conv_value, cost')
    .eq('site', site)
    .eq('product', product)
    .gte('day', fromDate)
    .lte('day', toDate)
    .order('day', { ascending: true });
  console.log('snapshot check', { count: snap ? snap.length : 0, error: snapErr && snapErr.message });
  if(!snapErr && snap && snap.length === needed) return snap;

  console.log('snapshot missing, querying metrics');
  let { data, error } = await supabase
    .from('independent_landing_metrics')
    .select('day, clicks:sum(clicks), impr:sum(impr), conversions:sum(conversions), conv_value:sum(conv_value), cost:sum(cost)', { group: 'day' })
    .eq('site', site)
    .eq('landing_path', product)
    .gte('day', fromDate)
    .lte('day', toDate)
    .order('day', { ascending: true });
  if(error){
    console.error('raw metrics query failed', error.message);
    throw error;
  }
  const rows = (data||[]).map(r=>({
    day: r.day,
    clicks: safeNum(r.clicks),
    impr: safeNum(r.impr),
    conversions: safeNum(r.conversions),
    conv_value: safeNum(r.conv_value),
    cost: safeNum(r.cost)
  }));
  const upsertRows = rows.map(r=>({ site, product, ...r }));
  const { error: upErr } = await supabase
    .from('indep_product_snapshot')
    .upsert(upsertRows, { onConflict: 'site,product,day' });
  console.log('snapshot upsert', { count: upsertRows.length, error: upErr && upErr.message });
  if(upErr) console.error('snapshot upsert failed', upErr.message);
  return rows;
}

module.exports = async (req,res) => {
  try{
    const supabase = getClient();
    const { site, from, to, product } = req.query;
    console.log('product-stats request', { site, product, from, to });
    if(!site) return res.status(400).json({ error: 'missing site param' });
    const def = lastWeek();
    const toDate = parseDate(to, def.to);
    const fromDate = parseDate(from, def.from);
    console.log('product-stats range', { fromDate, toDate });
    if(product){
      const series = await getSeriesWithSnapshot(supabase, site, product, fromDate, toDate);
      const total = series.reduce((a,r)=>({
        clicks: a.clicks + safeNum(r.clicks),
        impr: a.impr + safeNum(r.impr),
        conversions: a.conversions + safeNum(r.conversions),
        conv_value: a.conv_value + safeNum(r.conv_value),
        cost: a.cost + safeNum(r.cost)
      }), { clicks:0, impr:0, conversions:0, conv_value:0, cost:0 });
      return res.status(200).json({ ok:true, series, total });
    }
    const { data, error } = await supabase
      .from('independent_landing_metrics')
      .select('landing_path, landing_url, clicks:sum(clicks), impr:sum(impr), conversions:sum(conversions), conv_value:sum(conv_value), cost:sum(cost)', { group: 'landing_path, landing_url' })
      .eq('site', site)
      .gte('day', fromDate)
      .lte('day', toDate);
    console.log('list query', { count: data ? data.length : 0, error: error && error.message });
    if(error) return res.status(500).json({ error: error.message });
    const list = (data||[]).map(r=>({
      landing_path: r.landing_path,
      landing_url: r.landing_url,
      product: extractName(r.landing_path),
      clicks: safeNum(r.clicks),
      impr: safeNum(r.impr),
      conversions: safeNum(r.conversions),
      conv_value: safeNum(r.conv_value),
      cost: safeNum(r.cost)
    }));
    res.status(200).json({ ok:true, list });
  }catch(e){
    console.error('product-stats failed', e);
    res.status(500).json({ error: e.message });
  }
};
