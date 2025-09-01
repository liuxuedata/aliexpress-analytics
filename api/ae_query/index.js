import { createClient } from '@supabase/supabase-js';

/** 
 * GET /api/ae_query?start=YYYY-MM-DD&end=YYYY-MM-DD&granularity=day|week|month
 * Returns rows aggregated to the requested granularity.
 * Includes new fields: order_items, search_ctr, avg_stay_seconds.
 * - Counts are summed
 * - search_ctr is exposure-weighted average
 * - avg_stay_seconds is visitors-weighted average
 */
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
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AE_TABLE_NAME || 'ae_self_operated_daily';
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { start, end, site = 'ae_self_operated_a', aggregate = 'time' } = req.query;
  const granularity = (req.query.granularity || 'day').toLowerCase();
  
  console.log('AE查询参数:', { start, end, site, granularity, aggregate });
  
  // 添加数据库查询调试信息
  console.log('查询数据库表:', TABLE);
  console.log('查询条件: site =', site, ', start =', start, ', end =', end, ', aggregate =', aggregate);
  
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' });
  if (!['day','week','month'].includes(granularity)) return res.status(400).json({ error: 'Invalid granularity' });
  if (!['time', 'product'].includes(aggregate)) return res.status(400).json({ error: 'Invalid aggregate mode' });

  try {
    // Paged fetch from Supabase
    const pageSize = 1000;
    let from = 0, to = pageSize - 1;
    const out = [];
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select(`
          product_id,
          stat_date,
          exposure,
          visitors,
          views,
          add_people,
          add_count,
          pay_items,
          pay_orders,
          pay_buyers,
          fav_people,
          fav_count,
          order_items,
          search_ctr,
          avg_stay_seconds
        `)
        .eq('site', site)
        .gte('stat_date', String(start))
        .lte('stat_date', String(end))
        .order('product_id', { ascending: true })
        .order('stat_date', { ascending: true })
        .range(from, to);
      if (error) {
        console.error('数据库查询错误:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log(`查询结果: 第${Math.floor(from/pageSize)+1}页, 返回${data?.length || 0}条记录`);
      out.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize; to += pageSize;
    }

    function bucketKey(dateISO, g) {
      const d = new Date(dateISO + 'T00:00:00Z');
      if (g === 'week') {
        // Monday-based week start
        const day = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - day);
        return d.toISOString().slice(0, 10);
      }
      if (g === 'month') {
        d.setUTCDate(1);
        return d.toISOString().slice(0, 10);
      }
      return dateISO;
    }

    // Aggregate based on mode
    const map = new Map();
    for (const r of out) {
      let key;
      if (aggregate === 'product') {
        // Aggregate by product_id only for entire period
        key = r.product_id;
      } else {
        // Original time-based aggregation
        const b = bucketKey(r.stat_date, granularity);
        key = r.product_id + '__' + b;
      }
      
      if (!map.has(key)) {
        map.set(key, {
          product_id: r.product_id,
          bucket: aggregate === 'product' ? `${start}~${end}` : bucketKey(r.stat_date, granularity),
          min_date: r.stat_date,
          max_date: r.stat_date,
          exposure: 0,
          visitors: 0,
          views: 0,
          add_people: 0,
          add_count: 0,
          pay_items: 0,
          pay_orders: 0,
          pay_buyers: 0,
          fav_people: 0,
          fav_count: 0,
          order_items: 0,
          // Weighted numerators / denominators
          _ctr_num: 0, _ctr_den: 0,           // search_ctr weighted by exposure
          _stay_num: 0, _stay_den: 0          // avg_stay_seconds weighted by visitors
        });
      }
      const acc = map.get(key);

      acc.exposure   += r.exposure   || 0;
      acc.visitors   += r.visitors   || 0;
      acc.views      += r.views      || 0;
      acc.add_people += r.add_people || 0;
      acc.add_count  += r.add_count  || 0;
      acc.pay_items  += r.pay_items  || 0;
      acc.pay_orders += r.pay_orders || 0;
      acc.pay_buyers += r.pay_buyers || 0;
      acc.fav_people += r.fav_people || 0;
      acc.fav_count  += r.fav_count  || 0;
      acc.order_items += r.order_items || 0;

      // search_ctr: exposure-weighted average (CTR is clicks / impressions; we only have rate)
      if (r.search_ctr !== null && r.search_ctr !== undefined) {
        const w = (r.exposure || 0);
        acc._ctr_num += (Number(r.search_ctr) || 0) * w;
        acc._ctr_den += w;
      }
      // avg_stay_seconds: visitors-weighted average
      if (r.avg_stay_seconds !== null && r.avg_stay_seconds !== undefined) {
        const wv = (r.visitors || 0);
        acc._stay_num += (Number(r.avg_stay_seconds) || 0) * wv;
        acc._stay_den += wv;
      }

      if (r.stat_date < acc.min_date) acc.min_date = r.stat_date;
      if (r.stat_date > acc.max_date) acc.max_date = r.stat_date;
    }

    const agg = Array.from(map.values()).map(x => {
      const search_ctr = x._ctr_den > 0 ? (x._ctr_num / x._ctr_den) : null;
      const avg_stay_seconds = x._stay_den > 0 ? (x._stay_num / x._stay_den) : null;
      
      // Calculate ratios for product aggregation mode
      let visitor_ratio = null, add_to_cart_ratio = null, payment_ratio = null;
      if (aggregate === 'product') {
        // 访客比 = 总访客数 / 总曝光数
        visitor_ratio = x.exposure > 0 ? (x.visitors / x.exposure) * 100 : null;
        // 加购比 = 总加购数 / 总访客数
        add_to_cart_ratio = x.visitors > 0 ? (x.add_count / x.visitors) * 100 : null;
        // 支付比 = 总支付数 / 总加购数
        payment_ratio = x.add_count > 0 ? (x.pay_items / x.add_count) * 100 : null;
      }
      
      return {
        product_id: x.product_id,
        bucket: x.bucket,
        bucket_label: aggregate === 'product' 
          ? x.bucket 
          : ((granularity === 'day')
            ? x.bucket
            : (x.min_date === x.max_date ? x.min_date : `${x.min_date}~${x.max_date}`)),
        exposure: x.exposure,
        visitors: x.visitors,
        views: x.views,
        add_people: x.add_people,
        add_count: x.add_count,
        pay_items: x.pay_items,
        pay_orders: x.pay_orders,
        pay_buyers: x.pay_buyers,
        fav_people: x.fav_people,
        fav_count: x.fav_count,
        order_items: x.order_items,
        search_ctr,
        avg_stay_seconds,
        // New ratio fields for product aggregation
        visitor_ratio,
        add_to_cart_ratio,
        payment_ratio
      };
    });

    return res.status(200).json({ ok: true, rows: agg });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
