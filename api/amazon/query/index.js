import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AMZ_TABLE_NAME || 'amazon_daily_by_asin';
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { start, end } = req.query;
  const granularity = (req.query.granularity || 'day').toLowerCase();
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' });
  if (!['day','week','month'].includes(granularity)) return res.status(400).json({ error: 'Invalid granularity' });

  try {
    const pageSize = 1000;
    let from = 0, to = pageSize - 1;
    const out = [];
    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select(`marketplace_id,asin,stat_date,sessions,page_views,units_ordered,ordered_product_sales,buy_box_pct`)
        .gte('stat_date', String(start))
        .lte('stat_date', String(end))
        .order('asin', { ascending: true })
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
        return d.toISOString().slice(0,10);
      }
      if (g === 'month') {
        d.setUTCDate(1);
        return d.toISOString().slice(0,10);
      }
      return dateISO;
    }

    const map = new Map();
    for (const r of out) {
      const b = bucketKey(r.stat_date, granularity);
      const key = `${r.asin}__${b}`;
      if (!map.has(key)) {
        map.set(key, {
          asin: r.asin,
          bucket: b,
          marketplace_id: r.marketplace_id,
          sessions: 0,
          page_views: 0,
          units_ordered: 0,
          ordered_product_sales: 0,
          _bb_num: 0,
          _bb_den: 0,
          min_date: r.stat_date,
          max_date: r.stat_date
        });
      }
      const acc = map.get(key);
      acc.sessions += r.sessions || 0;
      acc.page_views += r.page_views || 0;
      acc.units_ordered += r.units_ordered || 0;
      acc.ordered_product_sales += Number(r.ordered_product_sales) || 0;
      if (r.buy_box_pct !== null && r.buy_box_pct !== undefined) {
        const w = r.sessions || 0;
        acc._bb_num += (Number(r.buy_box_pct) || 0) * w;
        acc._bb_den += w;
      }
      if (r.stat_date < acc.min_date) acc.min_date = r.stat_date;
      if (r.stat_date > acc.max_date) acc.max_date = r.stat_date;
    }

    const rows = Array.from(map.values()).map(x => {
      const buy_box_pct = x._bb_den > 0 ? (x._bb_num / x._bb_den) : null;
      return {
        asin: x.asin,
        marketplace_id: x.marketplace_id,
        bucket: x.bucket,
        bucket_label: granularity === 'day'
          ? x.bucket
          : (x.min_date === x.max_date ? x.min_date : `${x.min_date}~${x.max_date}`),
        sessions: x.sessions,
        page_views: x.page_views,
        units_ordered: x.units_ordered,
        ordered_product_sales: x.ordered_product_sales,
        buy_box_pct
      };
    });

    return res.status(200).json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
