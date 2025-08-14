// /api/independent/stats/index.js
const { createClient } = require('@supabase/supabase-js');
function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  if (d && !isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return fallback;
}

function extractName(path) {
  const p = path || '';
  const seg = p.split('/').filter(Boolean).pop();
  const name = seg ? decodeURIComponent(seg) : '';
  return name || decodeURIComponent(p);
}

function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const PAGE_SIZE = 1000;

function lastWeek() {
  const today = new Date();
  const dow = today.getDay();
  // Monday of this week
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((dow + 6) % 7));
  // Previous week's Monday and Sunday
  const from = new Date(mondayThisWeek);
  from.setDate(mondayThisWeek.getDate() - 7);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return {
    from: from.toISOString().slice(0,10),
    to: to.toISOString().slice(0,10)
  };
}

module.exports = async (req, res) => {
  try {
    const supabase = getClient();
    const { site, from, to, limit = '20000' } = req.query;
    const def = lastWeek();
    const toDate = parseDate(to, def.to);
    const fromDate = parseDate(from, def.from);

    if (!site) return res.status(400).json({ error: 'missing site param, e.g. ?site=poolsvacuum.com' });

    // table data (fetch all pages up to limit)
    const limitNum = Math.min(Number(limit) || PAGE_SIZE, 20000);
    let table = [];
    for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
      const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
      const { data, error } = await supabase
        .from('independent_landing_metrics')
        .select('*')
        .eq('site', site)
        .gte('day', fromDate).lte('day', toDate)
        .order('day', { ascending: false })
        .range(fromIdx, toIdx);
      if (error) return res.status(500).json({ error: error.message });
      table = table.concat(data);
      if (!data.length || data.length < PAGE_SIZE) break;
    }

    table = (table || []).map(r => ({
      ...r,
      product: extractName(r.landing_path),
      clicks: safeNum(r.clicks),
      impr: safeNum(r.impr),
      ctr: safeNum(r.ctr),
      avg_cpc: safeNum(r.avg_cpc),
      cost: safeNum(r.cost),
      conversions: safeNum(r.conversions),
      cost_per_conv: safeNum(r.cost_per_conv),
      all_conv: safeNum(r.all_conv),
      conv_value: safeNum(r.conv_value),
      all_conv_rate: safeNum(r.all_conv_rate),
      conv_rate: safeNum(r.conv_rate)
    }));

    // daily summary series
    let { data: series, error: e2 } = await supabase
      .from('independent_landing_summary_by_day')
      .select('*')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: true });

    if (e2 && /independent_landing_summary_by_day/.test(e2.message)) {
      const { data: fallback, error: e2b } = await supabase
        .from('independent_landing_metrics')
        .select(
          'day, clicks:sum(clicks), impr:sum(impr), conversions:sum(conversions), conv_value:sum(conv_value), cost:sum(cost)'
        )
        .eq('site', site)
        .gte('day', fromDate)
        .lte('day', toDate)
        .order('day', { ascending: true });
      if (e2b) return res.status(500).json({ error: e2b.message });
      series = fallback || [];
    } else if (e2) {
      return res.status(500).json({ error: e2.message });
    }

    series = (series || []).map(r => ({
      ...r,
      clicks: safeNum(r.clicks),
      impr: safeNum(r.impr),
      conversions: safeNum(r.conversions),
      conv_value: safeNum(r.conv_value),
      cost: safeNum(r.cost)
    }));

    // top landing pages by conversions (aggregate all pages)
    let topPages = [];
    for (let fromIdx = 0;; fromIdx += PAGE_SIZE) {
      const toIdx = fromIdx + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('independent_landing_metrics')
        .select('landing_path, landing_url, conversions, conv_value, clicks, impr, cost')
        .eq('site', site)
        .gte('day', fromDate).lte('day', toDate)
        .range(fromIdx, toIdx);
      if (error) return res.status(500).json({ error: error.message });
      topPages = topPages.concat(data);
      if (!data.length || data.length < PAGE_SIZE) break;
    }

    const byPath = {};
    for (const r of topPages) {
      const key = r.landing_path;
      if (!byPath[key]) byPath[key] = { path: key, url: r.landing_url, conversions: 0, conv_value: 0, clicks: 0, impr: 0, cost: 0 };
      byPath[key].conversions += safeNum(r.conversions);
      byPath[key].conv_value += safeNum(r.conv_value);
      byPath[key].clicks += safeNum(r.clicks);
      byPath[key].impr += safeNum(r.impr);
      byPath[key].cost += safeNum(r.cost);
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
