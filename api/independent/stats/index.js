// /api/independent/stats/index.js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
);

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  if (d && !isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return fallback;
}

function extractName(path){
  const seg = (path||'').split('/').filter(Boolean).pop() || '';
  return decodeURIComponent(seg);
}

module.exports = async (req, res) => {
  try {
    const { site, from, to, limit = '500' } = req.query;
    const today = new Date();
    const toDate = parseDate(to, new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0,10));
    const fromDate = parseDate(from, new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29).toISOString().slice(0,10));

    if (!site) return res.status(400).json({ error: 'missing site param, e.g. ?site=poolsvacuum.com' });

    // table data
    let { data: table, error: e1 } = await supabase
      .from('independent_landing_metrics')
      .select('day, landing_path, landing_url, device, network, campaign, clicks, impr, ctr, avg_cpc, cost, conversions, cost_per_conv, all_conv, conv_value, all_conv_rate, conv_rate')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: false })
      .limit(Number(limit));

    if (e1) return res.status(500).json({ error: e1.message });

    table = (table || []).map(r => ({
      ...r,
      product: extractName(r.landing_path),
      conversions: Number(r.conversions || 0),
      cost_per_conv: Number(r.cost_per_conv || 0),
      all_conv: Number(r.all_conv || 0),
      conv_value: Number(r.conv_value || 0),
      all_conv_rate: Number(r.all_conv_rate || 0),
      conv_rate: Number(r.conv_rate || 0)
    }));

    // daily summary series
    let { data: series, error: e2 } = await supabase
      .from('independent_landing_summary_by_day')
      .select('*')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: true });

    if (e2) return res.status(500).json({ error: e2.message });

    // top landing pages by conversions
    let { data: topPages, error: e3 } = await supabase
      .from('independent_landing_metrics')
      .select('landing_path, landing_url, conversions, conv_value, clicks, impr, cost')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate);

    if (e3) return res.status(500).json({ error: e3.message });

    const byPath = {};
    for (const r of topPages) {
      const key = r.landing_path;
      if (!byPath[key]) byPath[key] = { path: key, url: r.landing_url, conversions: 0, conv_value: 0, clicks: 0, impr: 0, cost: 0 };
      byPath[key].conversions += Number(r.conversions||0);
      byPath[key].conv_value += Number(r.conv_value||0);
      byPath[key].clicks += Number(r.clicks||0);
      byPath[key].impr += Number(r.impr||0);
      byPath[key].cost += Number(r.cost||0);
    }
    const topList = Object.values(byPath)
      .map(x => ({
        ...x,
        product: extractName(x.path),
        ctr: x.impr>0 ? x.clicks/x.impr : 0,
        cpa: x.conversions>0 ? x.cost/x.conversions : 0,
        roas: x.cost>0 ? x.conv_value/x.cost : 0
      }))
      .sort((a,b)=> b.conversions - a.conversions)
      .slice(0, 50);

    res.status(200).json({ ok: true, from: fromDate, to: toDate, table, series, topList });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
