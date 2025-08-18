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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  // Allow using the standard anon key if service role is not available
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const TABLE = process.env.AE_TABLE_NAME || 'ae_self_operated_daily';
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });

  const { start, end } = req.query;
  const granularity = (req.query.granularity || 'day').toLowerCase();
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' });
  if (!['day','week','month'].includes(granularity)) return res.status(400).json({ error: 'Invalid granularity' });

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
        .gte('stat_date', String(start))
        .lte('stat_date', String(end))
        .order('product_id', { ascending: true })
        .order('stat_date', { ascending: true })
        .range(from, to);
      if (error) return res.status(500).json({ error: error.message });
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

    // Aggregate per product_id + bucket
    const map = new Map();
    for (const r of out) {
      const b = bucketKey(r.stat_date, granularity);
      const key = r.product_id + '__' + b;
      if (!map.has(key)) {
        map.set(key, {
          product_id: r.product_id,
          bucket: b,
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
      return {
        product_id: x.product_id,
        bucket: x.bucket,
        bucket_label: (granularity === 'day')
          ? x.bucket
          : (x.min_date === x.max_date ? x.min_date : `${x.min_date}~${x.max_date}`),
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
        avg_stay_seconds
      };
    });

    return res.status(200).json({ ok: true, rows: agg });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
