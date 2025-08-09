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
  stat_date: string; // 'YYYY-MM-DD'
  exposure?: number;
  visitors?: number;
  views?: number;
  add_people?: number;
  add_count?: number;
  pay_items?: number;
  pay_orders?: number;
  pay_buyers?: number;
};

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

const CHUNK = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body;
    const rows: Row[] = Array.isArray(body) ? body : (body?.rows ?? []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Invalid body, expected array of rows' });
    }

    // basic validation & normalization
    const normalized: Row[] = [];
    const dedupe = new Map<string, Row>();
    for (const r of rows) {
      const pid = String((r as any).product_id ?? '').trim();
      const date = String((r as any).stat_date ?? '').slice(0, 10);
      if (!pid || !date) continue;
      const key = `${pid}__${date}`;
      dedupe.set(key, {
        product_id: pid,
        stat_date: date,
        exposure: toNum((r as any).exposure),
        visitors: toNum((r as any).visitors),
        views: toNum((r as any).views),
        add_people: toNum((r as any).add_people),
        add_count: toNum((r as any).add_count),
        pay_items: toNum((r as any).pay_items),
        pay_orders: toNum((r as any).pay_orders),
        pay_buyers: toNum((r as any).pay_buyers),
      });
    }
    normalized.push(...dedupe.values());

    let upserted = 0;
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const chunk = normalized.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from(TABLE)
        .upsert(chunk, { onConflict: 'product_id,stat_date', count: 'estimated' });
      if (error) {
        // surface which chunk failed for easier debug
        return res.status(500).json({ error: error.message, from: i, to: i + CHUNK });
      }
      upserted += chunk.length;
    }

    return res.status(200).json({ ok: true, upserted });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
