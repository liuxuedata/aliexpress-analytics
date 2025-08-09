import { createClient } from '@supabase/supabase-js';

/** @type {import('@vercel/node').VercelApiHandler} */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AE_TABLE_NAME || 'ae_self_operated_daily';
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const body = req.body;
    const rows = Array.isArray(body) ? body : (body?.rows ?? []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Invalid body, expected array of rows' });
    }
    const toNum = (v) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      const n = parseFloat(String(v).replace(/,/g, '').trim());
      return isNaN(n) ? 0 : n;
    };

    const dedupe = new Map();
    for (const r of rows) {
      const pid = String(r?.product_id ?? '').trim();
      const date = String(r?.stat_date ?? '').slice(0, 10);
      if (!pid || !date) continue;
      const key = pid + '__' + date;
      dedupe.set(key, {
        product_id: pid,
        stat_date: date,
        exposure: toNum(r?.exposure),
        visitors: toNum(r?.visitors),
        views: toNum(r?.views),
        add_people: toNum(r?.add_people),
        add_count: toNum(r?.add_count),
        pay_items: toNum(r?.pay_items),
        pay_orders: toNum(r?.pay_orders),
        pay_buyers: toNum(r?.pay_buyers),
      });
    }
    const normalized = Array.from(dedupe.values());

    let upserted = 0;
    const CHUNK = 1000;
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const chunk = normalized.slice(i, i + CHUNK);
      const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'product_id,stat_date' });
      if (error) return res.status(500).json({ error: error.message, from: i, to: i + CHUNK });
      upserted += chunk.length;
    }
    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}