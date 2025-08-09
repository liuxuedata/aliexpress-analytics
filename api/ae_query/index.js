import { createClient } from '@supabase/supabase-js';

/** @type {import('@vercel/node').VercelApiHandler} */
export default async function handler(req, res) {
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

  const { start, end } = req.query;
  const granularity = req.query.granularity || 'day';
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' });
  if (!['day','week','month'].includes(granularity)) return res.status(400).json({ error: 'Invalid granularity' });

  try {
    const pageSize = 1000;
    let from = 0, to = pageSize - 1;
    const out = [];
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('product_id, stat_date, exposure, visitors, views, add_people, add_count, pay_items, pay_orders, pay_buyers, fav_people, fav_count')
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
          exposure: 0, visitors: 0, views: 0, add_people: 0, add_count: 0, pay_items: 0, pay_orders: 0, pay_buyers: 0,
          fav_people: 0, fav_count: 0
        });
      }
      const acc = map.get(key);
      acc.exposure += r.exposure || 0;
      acc.visitors += r.visitors || 0;
      acc.views += r.views || 0;
      acc.add_people += r.add_people || 0;
      acc.add_count += r.add_count || 0;
      acc.pay_items += r.pay_items || 0;
      acc.pay_orders += r.pay_orders || 0;
      acc.pay_buyers += r.pay_buyers || 0;
      acc.fav_people += r.fav_people || 0;
      acc.fav_count  += r.fav_count  || 0;
      if (r.stat_date < acc.min_date) acc.min_date = r.stat_date;
      if (r.stat_date > acc.max_date) acc.max_date = r.stat_date;
    }
    const agg = Array.from(map.values()).map(x => ({
      ...x,
      bucket_label: (granularity === 'day') ? x.bucket : (x.min_date === x.max_date ? x.min_date : `${x.min_date}~${x.max_date}`)
    }));

    return res.status(200).json({ ok: true, rows: agg });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
