
import { createClient } from '@supabase/supabase-js';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  // 去掉逗号和空格；parseFloat('12.3%') => 12.3
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isNaN(n) ? 0 : n;
}

function fmtDate(d) {
  if (!d) return '';
  let s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y,m,d2] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d2.padStart(2,'0')}`;
  }
  return s.slice(0,10);
}

// --- pick helpers with rich synonyms --- //
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

function pickProductId(row) {
  const v = pick(row, ['product_id','商品ID','商品id','id','product id','商品编号']);
  return String(v ?? '').trim();
}
function pickStatDate(row) {
  const v = pick(row, ['stat_date','日期','统计日期','date']);
  return fmtDate(v);
}
function pickExposure(row) {
  const v = pick(row, ['exposure','搜索曝光量','曝光量','search_exposure','impressions','曝光']);
  return toNum(v);
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
  const v = pick(row, ['visitors','商品访客数','访客数','访客人数','unique_visitors']);
  return toNum(v);
}
function pickViews(row) {
  const v = pick(row, ['views','商品浏览量','浏览量','pageviews','pv','商品pv','浏览量(PV)']);
  return toNum(v);
}
function pickAddPeople(row) {
  const v = pick(row, ['add_people','商品加购人数','加购人数','加购买家数','加入购物车人数','购物车买家数']);
  return toNum(v);
}
function pickAddCount(row) {
  const v = pick(row, ['add_count','商品加购件数','加购件数','加入购物车件数','购物车件数','购物车数量','购物车加购件数']);
  return toNum(v);
}
function pickPayItems(row) {
  const v = pick(row, ['pay_items','支付件数','付款件数','成交件数','支付商品件数']);
  return toNum(v);
}
function pickPayOrders(row) {
  const v = pick(row, ['pay_orders','支付订单数','订单数','支付订单']);
  return toNum(v);
}
function pickPayBuyers(row) {
  const v = pick(row, ['pay_buyers','支付买家数','支付人数','付款买家数','买家数']);
  return toNum(v);
}
// New fields
function pickOrderItems(row) {
  const v = pick(row, ['order_items','下单商品件数','下单件数','下单商品数','下单商品数量']);
  return toNum(v);
}
function pickAvgStaySeconds(row) {
  const v = pick(row, ['avg_stay_seconds','平均停留时长','平均停留时间','平均访问时长','平均停留时长(秒)']);
  return toNum(v); // 单位：秒
}
function pickSearchCtr(row) {
  const v = pick(row, ['search_ctr','搜索点击率','点击率','搜索点击率(%)','点击率(%)']);
  return toNum(v); // 存百分数数值，如 12.3 表示 12.3%
}

function normalize(r) {
  const row = {
    product_id: pickProductId(r),
    stat_date: pickStatDate(r),
    exposure: pickExposure(r),
    visitors: pickVisitors(r),
    views: pickViews(r),
    add_people: pickAddPeople(r),
    add_count: pickAddCount(r),
    pay_items: pickPayItems(r),
    pay_orders: pickPayOrders(r),
    pay_buyers: pickPayBuyers(r),
    // new
    order_items: pickOrderItems(r),
    avg_stay_seconds: pickAvgStaySeconds(r),
    search_ctr: pickSearchCtr(r),
  };
  if ('product_link' in row) delete row.product_link;
  return row;
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
      if (!row.product_id || !row.stat_date) continue;
      map.set(row.product_id + '__' + row.stat_date, row);
    }
    const rows = Array.from(map.values());

    const CHUNK = 1000;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'product_id,stat_date' });
      if (error) return res.status(500).json({ error: error.message, from: i, to: i + CHUNK });
      upserted += chunk.length;
    }
    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
