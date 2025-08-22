// /api/ozon/sync/index.js —— Ozon → Supabase 宽表同步（终版，合并现有实现 + 额外鲁棒性）
// 运行：Vercel Node，无需额外依赖（Node18+ 自带 fetch）。
// 环境变量：
//  - SUPABASE_URL
//  - SUPABASE_SERVICE_ROLE_KEY
//  - OZON_CLIENT_ID
//  - OZON_API_KEY
//  - （可选）OZON_TABLE_NAME = ozon_product_report_wide

const { createClient } = require('@supabase/supabase-js');

// ---------- 工具 ----------
function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}
function normalizeTableName(name, fallback = 'ozon_product_report_wide') {
  let t = (name || fallback).trim();
  t = t.replace(/^"+|"+$/g, '');
  t = t.replace(/^public\./i, '');
  return t;
}
function yestInCST8() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 8);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function isTrue(v) { return ['1', 'true', 'yes'].includes(String(v || '').toLowerCase()); }
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||'')); }
function dateRange(from, to){
  const out=[]; const s=new Date(from+'T00:00:00Z'); const e=new Date(to+'T00:00:00Z');
  for(let d=new Date(s); d<=e; d=new Date(d.getTime()+86400000)) out.push(d.toISOString().slice(0,10));
  return out;
}

// ---------- 维度/指标定义（请求顺序与映射一一对应） ----------
const REQ_DIMENSIONS = ['sku', 'offer_id', 'title', 'brand', 'category_1', 'category_2', 'category_3'];
const REQ_METRICS = [
  'hits_view', 'hits_view_search', 'hits_view_pdp',
  'hits_tocart_search', 'hits_tocart_pdp',
  'ordered_units', 'delivered_units', 'revenue',
  'cancelled_units', 'returned_units'
];

// Ozon → 你表的 俄文列名
const DIM_COL = {
  sku: 'sku',
  offer_id: 'model',
  title: 'tovary',
  brand: 'brend',
  category_1: 'kategoriya_1_urovnya',
  category_2: 'kategoriya_2_urovnya',
  category_3: 'kategoriya_3_urovnya'
};
const METRIC_COL = {
  hits_view:          'voronka_prodazh_pokazy_vsego',
  hits_view_search:   'voronka_prodazh_pokazy_v_poiske_i_kataloge',
  hits_view_pdp:      'voronka_prodazh_posescheniya_kartochki_tovara',
  hits_tocart_search: 'voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu',
  hits_tocart_pdp:    'voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu',
  ordered_units:      'voronka_prodazh_zakazano_tovarov',
  delivered_units:    'voronka_prodazh_dostavleno_tovarov',
  revenue:            'prodazhi_zakazano_na_summu',
  cancelled_units:    'voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_',
  returned_units:     'voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_'
};

// —— 将 Ozon 返回映射为宽表的一行 ——
function mapOzonItemToRow(item, den) {
  const row = { den };

  // 维度：常见返回形态为 [{ id: 'SKU', name: '商品名' }, ...]
  if (Array.isArray(item.dimensions)) {
    for (const d of item.dimensions) {
      const id = (d.id || '').toString();
      const key = DIM_COL[id];
      if (key) row[key] = (d.value ?? d.name ?? '').toString();
    }
    // 兼容只有一个维度对象（{id:<SKU>, name:<标题>}）
    if (!row.sku && item.dimensions[0]) {
      row.sku = String(item.dimensions[0].id ?? item.dimensions[0].value ?? '').trim();
    }
    if (!row.tovary && item.dimensions[0]) {
      row.tovary = String(item.dimensions[0].name ?? '').trim();
    }
  }

  // 指标：纯数字数组（与请求顺序一致）或 [{id,value}]
  if (Array.isArray(item.metrics)) {
    if (typeof item.metrics[0] !== 'object') {
      for (let i = 0; i < REQ_METRICS.length; i++) {
        const k = REQ_METRICS[i];
        const col = METRIC_COL[k];
        if (!col) continue;
        const v = Number(item.metrics[i] ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    } else {
      for (const m of item.metrics) {
        const col = METRIC_COL[m.id];
        if (!col) continue;
        const v = Number(m.value ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    }
  }

  // 主键/必填兜底
  if (!row.model) row.model = row.sku || '';       // 主键2
  if (!row.tovary) row.tovary = row.model || '';   // NOT NULL
  if (!row.sku || !row.model || !row.den) return null;

  return row;
}

// —— 拉取单日 Ozon ——
async function fetchOzonOneDay(date, creds, limit=1000){
  const body = {
    date_from: date,
    date_to: date,
    dimension: REQ_DIMENSIONS,
    metrics: REQ_METRICS,
    limit: Math.min(limit||1000, 1000),
    offset: 0
  };
  const all=[];
  while(true){
    const resp = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
      method: 'POST',
      headers: {
        'Client-Id': creds.clientId,
        'Api-Key': creds.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    let json; try{ json = JSON.parse(text); }catch{ json = { parse_error: text?.slice(0,400) }; }
    if (!resp.ok) throw new Error(json?.message || resp.statusText || 'Ozon API error');
    const chunk = json?.result?.data || json?.data || json?.rows || [];
    all.push(...chunk);
    if (chunk.length < body.limit) break;
    body.offset += body.limit;
  }
  return all;
}

// —— 读取现有列（可选，用于过滤未存在的列，避免 schema cache 报错） ——
async function getColumnSet(supabase, table){
  try{
    const { data, error } = await supabase
      .schema('information_schema')
      .from('columns')
      .select('column_name')
      .eq('table_schema','public')
      .eq('table_name', table);
    if (error) return null;
    return new Set((data||[]).map(x=>x.column_name));
  }catch{ return null; }
}
function filterByColumns(rows, colSet){
  if (!colSet || !rows?.length) return rows;
  return rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>colSet.has(k))));
}

// ---------- 入口 ----------
module.exports = async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, msg: 'method not allowed' });
  }

  try {
    const { OZON_CLIENT_ID, OZON_API_KEY, OZON_TABLE_NAME } = process.env;
    if (!OZON_CLIENT_ID || !OZON_API_KEY) throw new Error('Missing OZON_CLIENT_ID or OZON_API_KEY');

    const supabase = supa();
    const TABLE = normalizeTableName(OZON_TABLE_NAME || 'ozon_product_report_wide');

    // 查询参数
    const q = req.query || {};
    const limit = Math.min(Number(q.limit) || 1000, 1000);
    const preview = isTrue(q.preview);
    const debug   = isTrue(q.debug);

    // 支持单日或区间（from/to 优先）
    let dates = [];
    if (isISODate(q.from) && isISODate(q.to)) dates = dateRange(q.from, q.to);
    else if (isISODate(q.date)) dates = [q.date];
    else dates = [yestInCST8()];

    const creds = { clientId: OZON_CLIENT_ID, apiKey: OZON_API_KEY };

    // 取数
    const rawByDay = [];
    for (const d of dates) {
      const arr = await fetchOzonOneDay(d, creds, limit);
      rawByDay.push({ date: d, rows: arr });
    }

    // 映射
    let rows = [];
    for (const pack of rawByDay) {
      for (const it of pack.rows) {
        const r = mapOzonItemToRow(it, pack.date);
        if (r) rows.push(r);
      }
    }

    // 调试/预览
    if (debug) {
      const first = rawByDay[0]?.rows || [];
      return res.status(200).json({
        ok: true,
        days: dates.length,
        fetched: rawByDay.reduce((a,b)=>a + (b.rows?.length||0), 0),
        mapped: rows.length,
        sample_raw: first.slice(0,2),
        sample_rows: rows.slice(0,2)
      });
    }
    if (preview) {
      return res.status(200).json({ ok: true, count: rows.length, table: TABLE, rows: rows.slice(0, 5) });
    }
    if (rows.length === 0) {
      return res.status(200).json({ ok: true, count: 0, table: TABLE });
    }

    // 列白名单过滤（避免 schema 缓存导致的未知列错误）
    const colSet = await getColumnSet(supabase, TABLE);
    if (colSet) rows = filterByColumns(rows, colSet);

    // 分批 upsert（幂等）
    const CHUNK = 800; // 留点余量
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .schema('public')
        .from(TABLE)
        .upsert(chunk, { onConflict: 'sku,model,den' });
      if (error) throw new Error(error.message);
      upserted += chunk.length;
    }

    // 回查最新日期作为“是否更新”的信号
    const { data: latestRows, error: latestErr } = await supabase
      .schema('public')
      .from(TABLE)
      .select('den')
      .order('den', { ascending: false })
      .limit(1);
    if (latestErr) throw new Error(latestErr.message);
    const latestDen = latestRows?.[0]?.den || null;

    return res.status(200).json({
      ok: true,
      count: rows.length,
      table: TABLE,
      latestDen,
      updated: dates.includes(latestDen)
    });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message || 'unknown error' });
  }
};

