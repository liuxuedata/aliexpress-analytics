// /api/ozon/sync/index.js
// Ozon → Supabase 宽表同步（支持 days 回溯、多指标容错、UV 指标、预览/调试）
// 运行环境：Vercel Node 18+；依赖：@supabase/supabase-js

import { createClient } from '@supabase/supabase-js';

// ---------- 工具 ----------
const must = (v, name) => { if (!v) throw new Error(`Missing ${name}`); return v; };
const toISO = (d) => d.toISOString().slice(0, 10);
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const inTZ = (date, offsetHours = 8) => new Date(new Date(date).getTime() + offsetHours * 3600 * 1000);
const yestCST8 = () => { const z = inTZ(new Date(), 8); z.setUTCDate(z.getUTCDate() - 1); return toISO(z); };
const range = (from, to) => {
  const s = new Date(from + 'T00:00:00Z'), e = new Date(to + 'T00:00:00Z');
  const out = [];
  for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86400000)) out.push(toISO(d));
  return out;
};
const isTrue = (v) => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());
const num = (v) => (Number.isFinite(+v) ? +v : 0);

// ---------- Supabase ----------
function supa() {
  const url = must(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const key = must(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}
function normalizeTable(name, fallback = 'ozon_product_report_wide') {
  let t = (name || fallback).trim();
  t = t.replace(/^"+|"+$/g, '');
  t = t.replace(/^public\./i, '');
  return t;
}
async function getColumnSet(client, table) {
  try {
    const { data } = await client
      .schema('information_schema')
      .from('columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', table);
    return new Set((data || []).map((x) => x.column_name));
  } catch { return null; }
}
function filterCols(rows, colset) {
  if (!colset) return rows;
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => colset.has(k))));
}

// ---------- 维度/指标 & 列映射 ----------
const REQ_DIMENSIONS = ['sku', 'title']; // 实测：大多账号只保证这两个；其它用产品接口补更稳（此处先兼容）
const BASE_METRICS = [
  'hits_view',              // Показы, всего（总曝光）
  'hits_view_search',       // Показы в поиске и каталоге
  'hits_view_pdp',          // Показы на карточке товара
  'hits_tocart_search',     // В корзину из поиска или каталога（从搜索/目录加购）
  'hits_tocart_pdp',        // В корзину из карточки товара（从商品卡加购）
  'ordered_units',          // Заказано товаров
  'delivered_units',        // Доставлено товаров
  'revenue',                // 金额（可选）
  'cancelled_units',        // 取消（可选）
  'returned_units',         // 退货（可选）
];
const UV_CANDIDATES = [
  ['unique_view', 'unique_view_search', 'unique_view_pdp'],
  ['uniq_view',   'uniq_view_search',   'uniq_view_pdp'],
  ['visitors',    'visitors_search',    'visitors_pdp'],
];

// 库表字段（与你的创建脚本对应）
const METRIC_COL_BASE = {
  hits_view:              'voronka_prodazh_pokazy_vsego',
  hits_view_search:       'voronka_prodazh_pokazy_v_poiske_i_kataloge',
  hits_view_pdp:          'voronka_prodazh_pokazy_na_kartochke_tovara',
  hits_tocart_search:     'voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu',
  hits_tocart_pdp:        'voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu',
  ordered_units:          'voronka_prodazh_zakazano_tovarov',
  delivered_units:        'voronka_prodazh_dostavleno_tovarov',
  revenue:                'prodazhi_zakazano_na_summu',
  cancelled_units:        'voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_',
  returned_units:         'voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_',
};
const METRIC_COL_UV = {
  uv_total:  'voronka_prodazh_unikalnye_posetiteli_vsego',                   // Уникальные посетители, всего
  uv_search: 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',       // ...в поиске и каталоге
  uv_pdp:    'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',            // ...карточки товара
};

// ---------- Ozon 调用 ----------
async function fetchOzonDay(date, creds, metrics) {
  const body = {
    date_from: date,
    date_to: date,
    dimension: REQ_DIMENSIONS,
    metrics,
    limit: 1000,
    offset: 0,
  };
  const all = [];
  while (true) {
    const r = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
      method: 'POST',
      headers: {
        'Client-Id': creds.clientId,
        'Api-Key': creds.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { throw new Error(`Ozon JSON parse error: ${text.slice(0,300)}`); }
    if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);

    const chunk = j?.result?.data || j?.data || [];
    all.push(...chunk);
    if (chunk.length < body.limit) break;
    body.offset += body.limit;
  }
  return all;
}

function buildMetricPlans() {
  const plans = [];
  for (const uv of UV_CANDIDATES) plans.push([...BASE_METRICS, ...uv]);
  plans.push([...BASE_METRICS]); // 兜底：没有任何 UV
  const colMaps = plans.map((list) => {
    const m = { ...METRIC_COL_BASE };
    if (list.length === BASE_METRICS.length + 3) {
      const [u0, u1, u2] = list.slice(-3);
      m[u0] = METRIC_COL_UV.uv_total;
      m[u1] = METRIC_COL_UV.uv_search;
      m[u2] = METRIC_COL_UV.uv_pdp;
    }
    return m;
  });
  return { plans, colMaps };
}

// ---------- 映射 ----------
function mapOzonItem(item, den, metricIds, colMap) {
  const row = { den };

  // 维度（常见：dimensions[0] = {id: <sku>, name: <title>}）
  const d0 = item?.dimensions?.[0] || {};
  row.sku    = String(d0.id ?? '').trim();
  row.tovary = String(d0.name ?? '').trim();

  // 二级维度（大多账号不给；model/artikul 可后续扩展到产品接口获取）
  row.model = row.sku;                    // 兜底：主键一致性
  // row.artikul = '';                    // 如后续有来源可补

  // 指标（严格按请求顺序）
  const ms = Array.isArray(item.metrics) ? item.metrics : [];
  for (let i = 0; i < metricIds.length; i++) {
    const mid = metricIds[i];
    const col = colMap[mid];
    if (!col) continue;
    row[col] = num(ms[i]);
  }

  // 计算：加购总数（接口没有总计字段）
  const atcSearch = num(row.voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu);
  const atcPdp    = num(row.voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu);
  row.voronka_prodazh_dobavleniya_v_korzinu_vsego = atcSearch + atcPdp;

  // 兜底：UV 总数（如果接口没返回总 UV，但 search/pdp 有值）
  const uvTotal  = num(row[METRIC_COL_UV.uv_total]);
  const uvSearch = num(row[METRIC_COL_UV.uv_search]);
  const uvPdp    = num(row[METRIC_COL_UV.uv_pdp]);
  if (uvTotal === 0 && (uvSearch > 0 || uvPdp > 0)) {
    row[METRIC_COL_UV.uv_total] = uvSearch + uvPdp;
  }

  if (!row.sku || !row.model || !row.den) return null;
  return row;
}

// ---------- 主入口 ----------
export default async function handler(req, res) {
  try {
    if (req.method && req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, msg: 'Method Not Allowed' });
    }

    const OZON_CLIENT_ID = must(process.env.OZON_CLIENT_ID, 'OZON_CLIENT_ID');
    const OZON_API_KEY   = must(process.env.OZON_API_KEY, 'OZON_API_KEY');
    const TABLE          = normalizeTable(process.env.OZON_TABLE_NAME || 'ozon_product_report_wide');

    const q = req.query || {};
    const preview = isTrue(q.preview);
    const debug   = isTrue(q.debug);

    // ---- 解析日期 ----
    let dates = [];
    if (isISO(q.from) && isISO(q.to)) {
      dates = range(q.from, q.to);
    } else if (isISO(q.date) && q.days && !isNaN(q.days)) {
      const n = Math.max(1, Number(q.days));
      const end = q.date;
      const d0 = new Date(end + 'T00:00:00Z');
      const d1 = new Date(d0.getTime() - (n - 1) * 86400000);
      dates = range(toISO(d1), end);
    } else if (isISO(q.date)) {
      dates = [q.date];
    } else {
      dates = [yestCST8()]; // 默认：昨天（GMT+8）
    }

    const creds = { clientId: OZON_CLIENT_ID, apiKey: OZON_API_KEY };
    const { plans, colMaps } = buildMetricPlans();

    // ---- 拉取 + 映射 ----
    const rawPacks = [];
    for (const d of dates) {
      let got = null, used = null, cmap = null, lastErr = null;
      for (let i = 0; i < plans.length; i++) {
        try {
          const arr = await fetchOzonDay(d, creds, plans[i]);
          got = arr; used = plans[i]; cmap = colMaps[i];
          break;
        } catch (e) {
          lastErr = e;
          continue;
        }
      }
      if (!got) throw new Error(`analytics/data error: ${lastErr?.message || 'unknown'}`);
      rawPacks.push({ date: d, rows: got, metricIds: used, colMap: cmap });
    }

    let rows = [];
    for (const pack of rawPacks) {
      for (const it of pack.rows) {
        const r = mapOzonItem(it, pack.date, pack.metricIds, pack.colMap);
        if (r) rows.push(r);
      }
    }

    // ---- 预览 / 调试 ----
    if (debug) {
      return res.status(200).json({
        ok: true,
        dates,
        fetched: rawPacks.reduce((a, b) => a + (b.rows?.length || 0), 0),
        mapped: rows.length,
        metrics_used: rawPacks[rawPacks.length - 1]?.metricIds || [],
        sample_raw: rawPacks[0]?.rows?.slice(0, 2) || [],
        sample_rows: rows.slice(0, 5),
      });
    }
    if (preview) {
      return res.status(200).json({ ok: true, count: rows.length, table: TABLE, dates, rows: rows.slice(0, 5) });
    }
    if (!rows.length) {
      return res.status(200).json({ ok: true, count: 0, table: TABLE, dates });
    }

    // ---- 写库（幂等 upsert）----
    const client = supa();
    const colSet = await getColumnSet(client, TABLE);
    if (colSet) rows = filterCols(rows, colSet);

    const CHUNK = 800;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await client.schema('public').from(TABLE).upsert(chunk, { onConflict: 'sku,model,den' });
      if (error) throw new Error(error.message);
    }

    // ---- 回查最新日期 ----
    const { data: latestRows, error: latestErr } = await client
      .schema('public')
      .from(TABLE)
      .select('den')
      .order('den', { ascending: false })
      .limit(1);
    if (latestErr) throw new Error(latestErr.message);

    return res.status(200).json({
      ok: true,
      count: rows.length,
      table: TABLE,
      dates,
      latestDen: latestRows?.[0]?.den || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, msg: err?.message || 'unknown error' });
  }
}

