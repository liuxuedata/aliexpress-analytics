
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  try {
    const { source, from, to, keyword, limit = 200, offset = 0 } = req.query || {};

    let q = supabase
      .from('fact_daily_metrics')
      .select('*', { count: 'exact' })
      .order('stat_date', { ascending: false })
      .order('product_id', { ascending: true });

    if (source) q = q.eq('source_code', source);
    if (from) q = q.gte('stat_date', from);
    if (to) q = q.lte('stat_date', to);
    if (keyword) q = q.ilike('product_id', `%${keyword}%`);

    const l = Math.min(Number(limit) || 200, 1000);
    const o = Number(offset) || 0;
    q = q.range(o, o + l - 1);

    const { data, error, count } = await q;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ data, count });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
