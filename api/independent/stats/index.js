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
    let topList = Object.values(byPath)
      .map(x => ({
        ...x,
        product: extractName(x.path),
        ctr: x.impr>0 ? x.clicks/x.impr : 0,
        cpa: x.conversions>0 ? x.cost/x.conversions : 0,
        roas: x.cost>0 ? x.conv_value/x.cost : 0
      }))
      .sort((a,b)=> b.conversions - a.conversions)
      .slice(0, 50);

    async function calcKpis(tbl, from, to){
      const sum = (arr, k) => arr.reduce((s,r)=> s + safeNum(r[k]), 0);
      const clickSum = sum(tbl, 'clicks');
      const imprSum = sum(tbl, 'impr');
      const convSum = sum(tbl, 'conversions');
      const exposureSet = new Set();
      const clickSet = new Set();
      const convSet = new Set();
      tbl.forEach(r=>{
        const key = r.landing_path;
        if (safeNum(r.impr) > 0) exposureSet.add(key);
        if (safeNum(r.clicks) > 0) clickSet.add(key);
        if (safeNum(r.conversions) > 0) convSet.add(key);
      });
      let newCount = 0;
      try {
        const { data: firstRows, error: e3 } = await supabase
          .from('independent_landing_metrics')
          .select('landing_path, first_day:min(day)')
          .eq('site', site)
          .lte('day', to)
          .group('landing_path');
        if (!e3 && Array.isArray(firstRows)) {
          newCount = firstRows.filter(r => r.first_day >= from && r.first_day <= to).length;
        }
      } catch (e) {
        newCount = 0;
      }
      return {
        avg_ctr: +(imprSum>0 ? (clickSum/imprSum*100).toFixed(2) : 0),
        avg_conv_rate: +(clickSum>0 ? (convSum/clickSum*100).toFixed(2) : 0),
        exposure_product_count: exposureSet.size,
        click_product_count: clickSet.size,
        conversion_product_count: convSet.size,
        new_product_count: newCount
      };
    }

    const kpis = await calcKpis(table, fromDate, toDate);

    // previous period calculation
    const rangeDays = Math.floor((new Date(toDate) - new Date(fromDate)) / (24*60*60*1000)) + 1;
    const prevTo = new Date(fromDate);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - rangeDays + 1);

    let prevTable = [];
    for (let fromIdx = 0; prevTable.length < limitNum; fromIdx += PAGE_SIZE) {
      const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
      const { data, error } = await supabase
        .from('independent_landing_metrics')
        .select('*')
        .eq('site', site)
        .gte('day', prevFrom.toISOString().slice(0,10)).lte('day', prevTo.toISOString().slice(0,10))
        .order('day', { ascending: false })
        .range(fromIdx, toIdx);
      if (error) return res.status(500).json({ error: error.message });
      prevTable = prevTable.concat(data);
      if (!data.length || data.length < PAGE_SIZE) break;
    }
    prevTable = (prevTable || []).map(r => ({
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

    const prevMap = {};
    prevTable.forEach(r => {
      const k = r.landing_path;
      if (!prevMap[k]) prevMap[k] = { conv_value: 0, conversions: 0, clicks: 0 };
      prevMap[k].conv_value += safeNum(r.conv_value);
      prevMap[k].conversions += safeNum(r.conversions);
      prevMap[k].clicks += safeNum(r.clicks);
    });
    topList = topList.map(x => ({
      ...x,
      prev_conv_value: prevMap[x.path]?.conv_value || 0,
      prev_conversions: prevMap[x.path]?.conversions || 0,
      prev_clicks: prevMap[x.path]?.clicks || 0
    }));

    const kpis_prev = await calcKpis(prevTable, prevFrom.toISOString().slice(0,10), prevTo.toISOString().slice(0,10));

    res.status(200).json({ ok: true, from: fromDate, to: toDate, table, series, topList, kpis, kpis_prev });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
