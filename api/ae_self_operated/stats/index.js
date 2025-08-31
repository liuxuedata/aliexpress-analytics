// /api/ae_self_operated/stats/index.js
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  if (d && !isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return fallback;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
  return {
    from: from.toISOString().slice(0,10),
    to: to.toISOString().slice(0,10)
  };
}

module.exports = async (req, res) => {
  try {
    const supabase = getClient();
    const { site = 'A站', from, to, limit = '10000' } = req.query;
    const def = lastWeek();
    const toDate = parseDate(to, def.to);
    const fromDate = parseDate(from, def.from);
    const limitNum = Math.min(Number(limit) || 10000, 20000);

    // 获取表格数据
    const { data: table, error: tableError } = await supabase
      .from('ae_self_operated_daily')
      .select('*')
      .eq('site', site)
      .gte('stat_date', fromDate)
      .lte('stat_date', toDate)
      .order('stat_date', { ascending: false })
      .order('product_id')
      .limit(limitNum);

    if (tableError) {
      return res.status(500).json({ error: tableError.message });
    }

    // 获取时间序列数据（按日期聚合）
    const { data: series, error: seriesError } = await supabase
      .from('v_ae_self_operated_daily')
      .select('stat_date, exposure, visitors, views, add_people, add_count, pay_items, pay_orders, pay_buyers')
      .eq('site', site)
      .gte('stat_date', fromDate)
      .lte('stat_date', toDate)
      .order('stat_date', { ascending: true });

    if (seriesError) {
      return res.status(500).json({ error: seriesError.message });
    }

    // 计算KPI指标
    const kpis = {
      total_exposure: 0,
      total_visitors: 0,
      total_views: 0,
      total_add_people: 0,
      total_add_count: 0,
      total_pay_items: 0,
      total_pay_orders: 0,
      total_pay_buyers: 0,
      avg_ctr: 0,
      avg_cvr: 0,
      product_count: 0
    };

    const productSet = new Set();
    let totalClicks = 0;

    (table || []).forEach(row => {
      productSet.add(row.product_id);
      kpis.total_exposure += safeNum(row.exposure);
      kpis.total_visitors += safeNum(row.visitors);
      kpis.total_views += safeNum(row.views);
      kpis.total_add_people += safeNum(row.add_people);
      kpis.total_add_count += safeNum(row.add_count);
      kpis.total_pay_items += safeNum(row.pay_items);
      kpis.total_pay_orders += safeNum(row.pay_orders);
      kpis.total_pay_buyers += safeNum(row.pay_buyers);
      totalClicks += safeNum(row.visitors);
    });

    kpis.product_count = productSet.size;
    kpis.avg_ctr = kpis.total_exposure > 0 ? (kpis.total_visitors / kpis.total_exposure) * 100 : 0;
    kpis.avg_cvr = totalClicks > 0 ? (kpis.total_pay_orders / totalClicks) * 100 : 0;

    // 获取热门产品（按订单数排序）
    const { data: topProducts, error: topError } = await supabase
      .from('ae_self_operated_daily')
      .select('product_id, pay_orders, pay_items, pay_buyers, visitors, views')
      .eq('site', site)
      .gte('stat_date', fromDate)
      .lte('stat_date', toDate)
      .order('pay_orders', { ascending: false })
      .limit(10);

    if (topError) {
      return res.status(500).json({ error: topError.message });
    }

    // 聚合热门产品数据
    const productStats = {};
    (topProducts || []).forEach(row => {
      if (!productStats[row.product_id]) {
        productStats[row.product_id] = {
          product_id: row.product_id,
          pay_orders: 0,
          pay_items: 0,
          pay_buyers: 0,
          visitors: 0,
          views: 0
        };
      }
      productStats[row.product_id].pay_orders += safeNum(row.pay_orders);
      productStats[row.product_id].pay_items += safeNum(row.pay_items);
      productStats[row.product_id].pay_buyers += safeNum(row.pay_buyers);
      productStats[row.product_id].visitors += safeNum(row.visitors);
      productStats[row.product_id].views += safeNum(row.views);
    });

    const topList = Object.values(productStats)
      .sort((a, b) => b.pay_orders - a.pay_orders)
      .slice(0, 10);

    return res.status(200).json({
      ok: true,
      table: table || [],
      series: series || [],
      kpis,
      topList
    });

  } catch (error) {
    console.error('AE Self Operated Stats API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
