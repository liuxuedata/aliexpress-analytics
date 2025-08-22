// /api/ozon/sync/index.js —— Ozon → Supabase 宽表同步（终版，支持 days 回溯、多指标容错、UV 指标、预览/调试）
// 运行环境：Vercel Node 18+（全局 fetch 可用）
// 依赖：@supabase/supabase-js

const { createClient } = require('@supabase/supabase-js');

/* ------------------------------------
 * 工具函数
 * ------------------------------------ */
function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function dateRange(from, to) {
  const out = []; const s = new Date(from + 'T00:00:00Z'); const e = new Date(to + 'T00:00:00Z');
  for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/* ------------------------------------
 * 维度/指标定义（请求顺序与映射一一对应）
 * ------------------------------------ */
const REQ_DIMENSIONS = ['sku', 'offer_id', 'title', 'brand', 'category_1', 'category_2', 'category_3'];

// 基础指标（已上线稳定）
const BASE_METRICS = [
  'hits_view',              // 展示（总）
  'hits_view_search',       // 搜索/目录展示
  'hits_view_pdp',          // 商品卡展示
  'hits_tocart_search',     // 加购 来源=搜索/目录
  'hits_tocart_pdp',        // 加购 来源=商品卡
  'ordered_units',          // 订购件数
  'delivered_units',        // 送达件数
  'revenue',                // 订购金额
  'cancelled_units',        // 取消件数
  'returned_units'          // 退货件数
];

// UV 指标的多种命名候选（不同账号/版本可能不同；失败则自动降级只取 BASE）
const UV_METRIC_CANDIDATES = [
  ['unique_view', 'unique_view_search', 'unique_view_pdp'],
  ['uniq_view',   'uniq_view_search',   'uniq_view_pdp'],
  ['visitors',    'visitors_search',    'visitors_pdp']
];

// —— 维度列映射（俄文命名与库表） ——
const DIM_COL = {
  sku: 'sku',
  offer_id: 'model', // 先写入 model；必要时再从产品接口补齐
  title: 'tovary',
  brand: 'brend',
  category_1: 'kategoriya_1_urovnya',
  category_2: 'kategoriya_2_urovnya',
  category_3: 'kategoriya_3_urovnya'
};

// —— 基础指标 → 列（与你的库表字段一致） ——
const METRIC_COL_BASE = {
  hits_view:          'voronka_prodazh_pokazy_vsego',
  hits_view_search:   'voronka_prodazh_pokazy_v_poiske_i_kataloge',
  hits_view_pdp:      'voronka_prodazh_pokazy_na_kartochke_tovara',
  hits_tocart_search: 'voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu',
  hits_tocart_pdp:    'voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu',
  ordered_units:      'voronka_prodazh_zakazano_tovarov',
  delivered_units:    'voronka_prodazh_dostavleno_tovarov',
  revenue:            'prodazhi_zakazano_na_summu',
  cancelled_units:    'voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_',
  returned_units:     'voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_'
};

// —— UV 指标 → 列（总 / 搜索目录 / 商品卡） ——
const METRIC_COL_UV = {
  uv_total:  'voronka_prodazh_unikalnye_posetiteli_vsego',
  uv_search: 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
  uv_pdp:    'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara'
};

/* ------------------------------------
 * Ozon 拉取 + 映射
 * ------------------------------------ */
function buildMetricsAndColumnMap() {
  const metricCombos = [];
  for (const uv of UV_METRIC_CANDIDATES) metricCombos.push([...BASE_METRICS, ...uv]);
  metricCombos.push([...BASE_METRICS]); // 兜底

  const colMaps = metricCombos.map(list => {
    const map = { ...METRIC_COL_BASE };
    if (list.length === BASE_METRICS.length + 3) {
      const [uv0, uv1, uv2] = list.slice(-3);
      map[uv0] = METRIC_COL_UV.uv_total;
      map[uv1] = METRIC_COL_UV.uv_search;
      map[uv2] = METRIC_COL_UV.uv_pdp;
    }
    return map;
  });
  return { metricCombos, colMaps };
}

// 拉取单日（分页）
async function fetchOzonOneDay(date, creds, metrics) {
  const body = {
    date_from: date,
    date_to: date,
    dimension: REQ_DIMENSIONS,
    metrics,
    limit: 1000,
    offset: 0
  };
  const all = [];
  while (true) {
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
    let json; try { json = JSON.parse(text); } catch { json = { parse_error: text?.slice(0, 400) }; }
    if (!resp.ok) {
      const msg = json?.message || resp.statusText || 'Ozon API error';
      throw new Error(msg);
    }
    const chunk = json?.result?.data || json?.data || json?.rows || [];
    all.push(...chunk); // 修正：防止写成 all.push(.chunk) 的笔误
    if (chunk.length < body.limit) break;
    body.offset += body.limit;
  }
  return all;
}

// 将一条 Ozon 返回映射为库里的一行
function mapOzonItemToRow(item, den, metricsUsed, metricColsMap) {
  const row = { den };

  // 维度
  if (Array.isArray(item.dimensions)) {
    for (const d of item.dimensions) {
      const id = (d.id || '').toString();
      const key = DIM_COL[id];
      if (key) row[key] = (d.value ?? d.name ?? '').toString();
    }
    // 兼容只有一个维度对象（{id: <SKU>, name: <标题>}) 的形态
    if (!row.sku && item.dimensions[0]) row.sku   = String(item.dimensions[0].id   ?? item.dimensions[0].value ?? '').trim();
    if (!row.tovary && item.dimensions[0]) row.tovary = String(item.dimensions[0].name ?? '').trim();
  }

  // 指标：纯数组（按 metricsUsed 顺序）或 [{id,value}] 皆可
  if (Array.isArray(item.metrics)) {
    if (typeof item.metrics[0] !== 'object') {
      for (let i = 0; i < metricsUsed.length; i++) {
        const metricId = metricsUsed[i];
        const col = metricColsMap[metricId];
        if (!col) continue;
        const v = Number(item.metrics[i] ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    } else {
      for (const m of item.metrics) {
        const col = metricColsMap[m.id];
        if (!col) continue;
        const v = Number(m.value ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    }
  }

  // 主键/必填兜底
  if (!row.model) row.model = row.sku || '';
  if (!row.tovary) row.tovary = row.model || '';
  if (!row.sku || !row.model || !row.den) return null;

  return row;
}

/* ------------------------------------
 * 可选：读取现有列（过滤不存在的列，避免 schema cache 报错）
 * ------------------------------------ */
async function getColumnSet(supabase, table) {
  try {
    const { data, error } = await supabase
      .schema('information_schema')
      .from('columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', table);
    if (error) return null;
    return new Set((data || []).map(x => x.column_name));
  } catch {
    return null;
  }
}
function filterByColumns(rows, colSet) {
  if (!colSet || !rows?.length) return rows;
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => colSet.has(k))));
}

/* ------------------------------------
 * 入口（支持：date / from+to / date+days）
 * ------------------------------------ */
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
    const preview = isTrue(q.preview);
    const debug   = isTrue(q.debug);

    // ===== 日期列表：支持 from/to，或 date+days，或单个 date，默认=昨天(GMT+8) =====
    let dates = [];
    if (isISODate(q.from) && isISODate(q.to)) {
      dates = dateRange(q.from, q.to);
    } else if (isISODate(q.date) && q.days && !isNaN(q.days)) {
      const n = Math.max(1, Number(q.days));
      const end = q.date;
      const d0 = new Date(end + 'T00:00:00Z');
      const d1 = new Date(d0.getTime() - (n - 1) * 86400000);
      const start = d1.toISOString().slice(0, 10);
      dates = dateRange(start, end);
    } else if (isISODate(q.date)) {
      dates = [q.date];
    } else {
      dates = [yestInCST8()];
    }

    const creds = { clientId: OZON_CLIENT_ID, apiKey: OZON_API_KEY };

    // 1) 拉 Ozon Analytics（带“指标组合降级”）—— 针对每一天尝试 UV+BASE，失败则退化为 BASE
    const { metricCombos, colMaps } = buildMetricsAndColumnMap();
    let chosenMetrics = null; // 记录最后一次成功的组合（用于 debug 回显）

    const rawByDay = [];
    for (const d of dates) {
      let got = null, used = null, colsMap = null, lastErr = null;
      for (let i = 0; i < metricCombos.length; i++) {
        const list = metricCombos[i];
        try {
          const arr = await fetchOzonOneDay(d, creds, list);
          got = arr; used = list; colsMap = colMaps[i];
          break;
        } catch (e) {
          lastErr = e;
          continue;
        }
      }
      if (!got) throw new Error('analytics/data error: ' + (lastErr?.message || 'unknown'));
      rawByDay.push({ date: d, rows: got, metricsUsed: used, colsMap });
      chosenMetrics = used; // 以最后一次成功为准
    }

    // 2) 映射
    let rows = [];
    for (const pack of rawByDay) {
      const { date, rows: arr, metricsUsed, colsMap } = pack;
      for (const it of arr) {
        const r = mapOzonItemToRow(it, date, metricsUsed, colsMap);
        if (r) rows.push(r);
      }
    }

    // 3) 调试/预览
    if (debug) {
      const first = rawByDay[0]?.rows || [];
      return res.status(200).json({
        ok: true,
        days: dates.length,
        dates,
        fetched: rawByDay.reduce((a, b) => a + (b.rows?.length || 0), 0),
        mapped: rows.length,
        metrics_used: chosenMetrics,
        sample_raw: first.slice(0, 2),
        sample_rows: rows.slice(0, 2)
      });
    }
    if (preview) {
      return res.status(200).json({ ok: true, count: rows.length, table: TABLE, dates, rows: rows.slice(0, 5) });
    }
    if (rows.length === 0) {
      return res.status(200).json({ ok: true, count: 0, table: TABLE, dates });
    }

    // 4) 入库（幂等 upsert；按现有列过滤，避免 schema cache 报错）
    const colSet = await getColumnSet(supabase, TABLE);
    if (colSet) rows = filterByColumns(rows, colSet);

    const CHUNK = 800;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .schema('public')
        .from(TABLE)
        .upsert(chunk, { onConflict: 'sku,model,den' });
      if (error) throw new Error(error.message);
    }

    // 5) 回查最新日期作为“是否更新”的信号
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
      dates,
      latestDen,
      updated: dates.includes(latestDen)
    });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e?.message || 'unknown error' });
  }
};
