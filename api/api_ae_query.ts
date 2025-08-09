import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const TABLE = process.env.AE_TABLE_NAME || 'ae_self_operated_daily';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Row = {
  product_id: string;
  stat_date: string;
  exposure: number;
  visitors: number;
  views: number;
  add_people: number;
  add_count: number;
  pay_items: number;
  pay_orders: number;
  pay_buyers: number;
};

function bucketKey(dateISO: string, granularity: 'day'|'week'|'month'): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  if (granularity === 'week') {
    // ISO week: start on Monday
    const day = (d.getUTCDay() + 6) % 7; // 0..6 (Mon..Sun)
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === 'month') {
    d.setUTCDate(1);
    return d.toISOString().slice(0, 10);
  }
  return dateISO;
}

async function fetchAll(start: string, end: string): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;
  const out: Row[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('product_id, stat_date, exposure, visitors, views, add_people, add_count, pay_items, pay_orders, pay_buyers')
      .gte('stat_date', start)
      .lte('stat_date', end)
      .order('product_id', { ascending: true })
      .order('stat_date', { ascending: true })
      .range(from, to);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || (data as any[]).length < pageSize) break;
    from += pageSize;
    to += pageSize;
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { start, end, granularity = 'day' } = req.query as { start?: string; end?: string; granularity?: string };
    if (!start || !end) return res.status(400).json({ error: 'Missing start or end' });
    if (!['day','week','month'].includes(granularity)) return res.status(400).json({ error: 'Invalid granularity' });

    const rows = await fetchAll(start, end);

    // aggregate by product + bucket
    const g = granularity as 'day'|'week'|'month';
    const map = new Map<string, any>();
    for (const r of rows) {
      const b = bucketKey(r.stat_date, g);
      const key = `${r.product_id}__${b}`;
      const acc = map.get(key) || {
        product_id: r.product_id,
        bucket: b,
        exposure: 0, visitors: 0, views: 0, add_people: 0, add_count: 0, pay_items: 0, pay_orders: 0, pay_buyers: 0,
      };
      acc.exposure += r.exposure || 0;
      acc.visitors += r.visitors || 0;
      acc.views += r.views || 0;
      acc.add_people += r.add_people || 0;
      acc.add_count += r.add_count || 0;
      acc.pay_items += r.pay_items || 0;
      acc.pay_orders += r.pay_orders || 0;
      acc.pay_buyers += r.pay_buyers || 0;
      map.set(key, acc);
    }

    const agg = Array.from(map.values());
    return res.status(200).json({ ok: true, rows: agg });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
