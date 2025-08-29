import { createClient } from '@supabase/supabase-js';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isNaN(n) ? 0 : n;
}

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return s.slice(0, 10);
}

function normalize(r) {
  return {
    marketplace_id: String(r.marketplace_id || '').trim(),
    asin: String(r.asin || '').trim(),
    stat_date: fmtDate(r.stat_date),
    sessions: toNum(r.sessions),
    page_views: toNum(r.page_views),
    units_ordered: toNum(r.units_ordered),
    ordered_product_sales: toNum(r.ordered_product_sales),
    buy_box_pct: toNum(r.buy_box_pct)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AMZ_TABLE_NAME || 'amazon_daily_by_asin';
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rowsIn = Array.isArray(body) ? body : (body?.rows ?? []);
    if (!Array.isArray(rowsIn) || rowsIn.length === 0) {
      return res.status(400).json({ error: 'Invalid body, expected array of rows' });
    }

    const map = new Map();
    for (const raw of rowsIn) {
      const row = normalize(raw);
      if (!row.asin || !row.stat_date || !row.marketplace_id) continue;
      const key = `${row.asin}__${row.stat_date}__${row.marketplace_id}`;
      map.set(key, row);
    }
    const rows = Array.from(map.values());

    const CHUNK = 1000;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(TABLE)
        .upsert(chunk, { onConflict: 'asin,stat_date,marketplace_id' });
      if (error) {
        return res.status(500).json({ error: error.message, chunk_from: i, chunk_to: i + CHUNK });
      }
      upserted += chunk.length;
    }
    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
