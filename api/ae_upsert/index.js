
import { createClient } from '@supabase/supabase-js';

/**
 * AE 自运营：上传入库接口
 * 支持字段同义词映射；支持 dry_run（仅解析不写库）；统一点击率单位。
 * 
 * POST /api/ae_upsert[?dry_run=1]
 * body: { rows: Array<Row> }  或直接 Array<Row>
 * 返回: { ok: true, upserted } 或 { ok: true, dry_run: true, sample: [...] }
 */

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
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
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

// 同义词映射
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
  const newKeys = ['visitors_new','new_visitors','新访客数','新访客','新增访客'];
  const oldKeys = ['visitors_old','old_visitors','老访客数','老访客','回访客','复访客'];
  let has = false, vn = 0, vo = 0;
  for (const k of newKeys) if (row[k] !== undefined) { vn += toNum(row[k]); has = true; }
  for (const k of oldKeys) if (row[k] !== undefined) { vo += toNum(row[k]); has = true; }
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
  const v = pick(row, ['pay_items','支付商品件数','支付件数','付款件数','成交件数']);
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
function pickOrderItems(row) {
  const v = pick(row, ['order_items','下单商品件数','下单件数','下单商品数','下单商品数量']);
  return toNum(v);
}
function pickAvgStaySeconds(row) {
  const v = pick(row, ['avg_stay_seconds','平均停留时长','平均停留时间','平均访问时长','平均停留时长(秒)']);
  return toNum(v); // 秒
}
function pickSearchCtr(raw) {
  let v = pick(raw, ['search_ctr','搜索点击率','点击率','搜索点击率(%)','点击率(%)']);
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).trim();
  // 统一为小数：7.33% -> 0.0733；0.0733 保持
  if (s.endsWith('%')) return toNum(s.replace('%','')) / 100;
  const n = toNum(s);
  return n > 1 ? n/100 : n;
}

function normalize(r) {
  const row = {
    site: r.site || 'A站', // 保留site字段，如果没有则默认为'A站'
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
    order_items: pickOrderItems(r),
    avg_stay_seconds: pickAvgStaySeconds(r),
    search_ctr: pickSearchCtr(r),
  };
  if ('product_link' in row) delete row.product_link;
  return row;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // 健康检查
    return res.status(200).json({ ok: true, route: 'ae_upsert', msg: 'alive' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
    const isDry = (req.query?.dry_run === '1' || req.query?.dry === '1');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rowsIn = Array.isArray(body) ? body : (body?.rows ?? []);
    if (!Array.isArray(rowsIn) || rowsIn.length === 0) {
      return res.status(400).json({ error: 'Invalid body, expected array of rows' });
    }

    const map = new Map();
    for (const raw of rowsIn) {
      const row = normalize(raw);
      if (!row.product_id || !row.stat_date || !row.site) continue;
      map.set(row.site + '__' + row.product_id + '__' + row.stat_date, row);
    }
    const rows = Array.from(map.values()).sort((a,b)=>a.stat_date.localeCompare(b.stat_date));

    if (isDry) {
      return res.status(200).json({ ok: true, dry_run: true, count: rows.length, sample: rows.slice(0, 10) });
    }

    // 检查数据库中已存在的记录，用于跨站点及同日重复判断
    const productIds = [...new Set(rows.map(r => r.product_id))];
    const { data: existing, error: existErr } = await supabase
      .from(TABLE)
      .select('product_id, site, stat_date')
      .in('product_id', productIds);
    if (existErr) {
      return res.status(500).json({ error: existErr.message });
    }

    // 构建现有数据映射
    const existMap = new Map();
    (existing || []).forEach(r => {
      let info = existMap.get(r.product_id);
      if (!info) {
        info = { sites: new Set(), dateMap: new Map() };
        existMap.set(r.product_id, info);
      }
      info.sites.add(r.site);
      if (!info.dateMap.has(r.site)) info.dateMap.set(r.site, new Set());
      info.dateMap.get(r.site).add(r.stat_date);
    });

    // 检查是否存在跨站点冲突（数据库或上传数据自身）
    const incomingSiteMap = new Map();
    const conflictProducts = new Set();
    for (const row of rows) {
      let set = incomingSiteMap.get(row.product_id);
      if (!set) { set = new Set(); incomingSiteMap.set(row.product_id, set); }
      set.add(row.site);

      const info = existMap.get(row.product_id);
      if (info && (!info.sites.has(row.site) || info.sites.size > 1)) {
        conflictProducts.add(row.product_id);
      }
    }
    for (const [pid, sites] of incomingSiteMap.entries()) {
      if (sites.size > 1) conflictProducts.add(pid);
    }
    if (conflictProducts.size > 0) {
      return res.status(409).json({ error: 'product already exists in another site', conflicts: [...conflictProducts] });
    }

    // 通过跨站点检查后，处理同站点同日重复
    const toInsert = [];
    const newProducts = [];
    for (const row of rows) {
      let info = existMap.get(row.product_id);
      if (info) {
        const dates = info.dateMap.get(row.site);
        if (dates && dates.has(row.stat_date)) continue;
      } else {
        newProducts.push({ site: row.site, product_id: row.product_id, first_seen: row.stat_date });
        info = { sites: new Set(), dateMap: new Map() };
        existMap.set(row.product_id, info);
      }
      info.sites.add(row.site);
      if (!info.dateMap.has(row.site)) info.dateMap.set(row.site, new Set());
      info.dateMap.get(row.site).add(row.stat_date);
      toInsert.push(row);
    }

    // 插入每日数据，忽略冲突
    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(TABLE)
        .upsert(chunk, { onConflict: 'site,product_id,stat_date', ignoreDuplicates: true });
      if (error) {
        return res.status(500).json({ error: error.message, chunk_from: i, chunk_to: i + CHUNK });
      }
      inserted += chunk.length;
    }

    // 插入新品记录（如果存在）
    if (newProducts.length > 0) {
      await supabase
        .from('ae_self_new_products')
        .upsert(newProducts, { onConflict: 'site,product_id', ignoreDuplicates: true });
    }

    return res.status(200).json({ ok: true, upserted: inserted });
  } catch (e) {
    // 任何异常都返回 JSON
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
