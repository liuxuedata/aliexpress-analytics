import { createClient } from '@supabase/supabase-js';

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isNaN(n) ? 0 : n;
}

function pickVisitors(row) {
  if (row.visitors !== undefined && row.visitors !== null && row.visitors !== '') {
    return toNum(row.visitors);
  }
  const newKeys = ['visitors_new','new_visitors','newVisitor','new_visitor','新访客数','新访客','新增访客'];
  const oldKeys = ['visitors_old','old_visitors','oldVisitor','old_visitor','老访客数','老访客','回访客','复访客'];
  let has = false, vn = 0, vo = 0;
  for (const k of newKeys) { if (row[k] !== undefined) { vn += toNum(row[k]); has = true; } }
  for (const k of oldKeys) { if (row[k] !== undefined) { vo += toNum(row[k]); has = true; } }
  if (has) return vn + vo;
  return 0;
}

function normalize(r) {
  return {
    product_id: String(r.product_id ?? '').trim(),
    stat_date: String(r.stat_date ?? '').slice(0, 10),
    exposure: toNum(r.exposure),
    visitors: pickVisitors(r),
    views: toNum(r.views),
    add_people: toNum(r.add_people),
    add_count: toNum(r.add_count),
    pay_items: toNum(r.pay_items),
    pay_orders: toNum(r.pay_orders),
    pay_buyers: toNum(r.pay_buyers),
    // 收藏：若前端传了则入库；否则 0
    fav_people: toNum(r.fav_people),
    fav_count:  toNum(r.fav_count),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TABLE = process.env.AE_TABLE_NAME || 'ae_self_operated_daily';

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
        // 确保彻底去掉 product_link（即使前端传了）
        if ('product_link' in row) delete row.product_link;
      if (!row.product_id || !row.stat_date) continue;
      map.set(row.product_id + '__' + row.stat_date, row);
    }
    const rows = Array.from(map.values());

    const CHUNK = 1000;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
              const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'site,product_id,stat_date' });
      if (error) return res.status(500).json({ error: error.message, from: i, to: i + CHUNK });
      upserted += chunk.length;
    }
    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
