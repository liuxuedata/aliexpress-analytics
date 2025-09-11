// api/ozon/sync/index.js
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

/**
 * 工具：睡眠
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 解析日期参数：
 * - ?date=2025-08-21&days=7   => [2025-08-15 .. 2025-08-21]
 * - ?from=2025-08-15&to=2025-08-21
 * - 默认：只同步前一日（北京时间）
 */
function parseDateRange(query) {
  const pad = n => String(n).padStart(2, '0');

  const asISO = (d) => {
    const y = d.getUTCFullYear();
    const m = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    return `${y}-${m}-${dd}`;
  };

  // 按北京时间计算“昨日”
  const tzOffset = 8 * 60; // UTC+8
  const now = new Date(Date.now() + tzOffset * 60_000);
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const defaultDay = asISO(yesterday);

  let from = query.from || '';
  let to = query.to || '';

  if (!from && (query.date || query.day)) {
    const end = new Date(`${query.date || query.day}T00:00:00Z`);
    const d = Number(query.days || 1);
    const start = new Date(end.getTime() - (d - 1) * 86400000);
    from = asISO(start);
    to = asISO(end);
  }

  if (!from || !to) {
    from = defaultDay;
    to = defaultDay;
  }

  // 规范化（保证 from <= to）
  const df = new Date(`${from}T00:00:00Z`);
  const dt = new Date(`${to}T00:00:00Z`);
  if (df > dt) return { from: to, to: from };

  return { from, to };
}

/**
 * Ozon Analytics 请求体（最多 14 个 metrics）
 * - 曝光：hits_view / hits_view_search / hits_view_pdp
 * - 独立访客：session_view / session_view_search / session_view_pdp
 * - 加购：hits_tocart / hits_tocart_search / hits_tocart_pdp
 * - 交易：ordered_units / delivered_units / revenue
 * - 售后：cancellations / returns
 */
const METRICS = [
  'hits_view',
  'hits_view_search',
  'hits_view_pdp',
  'session_view',
  'session_view_search',
  'session_view_pdp',
  'hits_tocart',
  'hits_tocart_search',
  'hits_tocart_pdp',
  'ordered_units',
  'delivered_units',
  'revenue',
  'cancellations',
  'returns'
];

/**
 * Ozon API 调用（自动分页）
 */
async function fetchOzonAnalytics({ clientId, apiKey, date_from, date_to, hasPremium = false }) {
  const url = 'https://api-seller.ozon.ru/v1/analytics/data';
  const limit = 1000;
  let offset = 0;

  // Premium 可以带 modelID；否则只带 sku/day
  const dimensions = hasPremium ? ['sku', 'day', 'modelID'] : ['sku', 'day'];

  const all = [];
  /* 官方有“每个卖家每分钟1次”提示；如果你的账号被限速，就在下面循环处 sleep(1000*60)。
     大多数情况下可以连续拉取，这里不给强制等待。 */

  // 最多翻 200 页以避免意外死循环
  for (let page = 0; page < 200; page++) {
    const body = {
      date_from,
      date_to,
      dimensions,
      metrics: METRICS,
      limit,
      offset
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': clientId,
        'Api-Key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Ozon HTTP ${r.status}: ${t || r.statusText}`);
    }

    const j = await r.json();
    const chunk = j?.result?.data || [];
    all.push(...chunk);

    if (chunk.length < limit) break;
    offset += limit;
    // 若确实有频控，这里放开：await sleep(60_000);
  }
  return all;
}

/**
 * 将 Ozon 返回行映射为数据库字段（与你的表名一致）
 * - 表：ozon_product_report_wide
 * - 主键：(sku, model, den)
 * 注：若没有 Premium，model 使用 sku 以满足主键约束
 */
function mapRowToDb(row, hasPremium) {
  // dimensions: [ { id: <sku>, name: <title> }, { id: <day> }, (opt) { id: <modelID> } ]
  const dims = row.dimensions || [];
  const sku = String(dims[0]?.id || '').trim();
  const title = String(dims[0]?.name || '').trim();
  const den = String(dims[1]?.name || dims[1]?.id || '').slice(0, 10);
  const modelPremium = hasPremium ? String(dims[2]?.id || '').trim() : '';
  const model = modelPremium || sku; // 无 Premium 则使用 sku

  // 按 METRICS 顺序安全解包
  const m = row.metrics || [];
  const num = (i) => (typeof m[i] === 'number' && isFinite(m[i])) ? m[i] : 0;

  const hits_view = num(0);
  const hits_view_search = num(1);
  const hits_view_pdp = num(2);
  const session_view = num(3);
  const session_view_search = num(4);
  const session_view_pdp = num(5);
  const hits_tocart = num(6);
  const hits_tocart_search = num(7);
  const hits_tocart_pdp = num(8);
  const ordered_units = num(9);
  const delivered_units = num(10);
  const revenue = num(11);
  const cancellations = num(12);
  const returns = num(13);

  return {
    // 主键列
    sku,
    model,
    den, // date

    // 名称（俄语“Товары”）
    tovary: title,

    // 曝光（“Показы, всего/…卡片/…搜索与目录”）
    voronka_prodazh_pokazy_vsego: hits_view,
    voronka_prodazh_pokazy_v_poiske_i_kataloge: hits_view_search,
    voronka_prodazh_pokazy_na_kartochke_tovara: hits_view_pdp,

    // 独立访客（“Уникальные посетители …”）
    voronka_prodazh_unikalnye_posetiteli_vsego: session_view,
    voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge: session_view_search,
    voronka_prodazh_uv_s_prosmotrom_kartochki_tovara: session_view_pdp,

    // 加购（“В корзину, всего/… из поиска …/… из карточки …”）
    voronka_prodazh_dobavleniya_v_korzinu_vsego: hits_tocart,
    voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu: hits_tocart_search,
    voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu: hits_tocart_pdp,

    // 下单/发货/金额
    voronka_prodazh_zakazano_tovarov: ordered_units,
    voronka_prodazh_dostavleno_tovarov: delivered_units,
    prodazhi_zakazano_na_summu: revenue,

    // 可选：取消/退货（若你表有对应列，可打开并在表中添加）
    // voronka_prodazh_otmeneno_tovarov_na_datu_zakaza_: cancellations,
    // voronka_prodazh_vozvrascheno_tovarov_na_datu_zakaza_: returns,
  };
}

/**
 * 按主键去重
 */
function dedupeByKey(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.sku || !r.den || !r.model) continue;
    map.set(`${r.sku}__${r.model}__${r.den}`, r);
  }
  return Array.from(map.values());
}

/**
 * Supabase upsert
 */
async function upsertRows({ supabase, table, rows }) {
  if (!rows.length) return { upserted: 0 };
  // 分批插入
  const CHUNK = 1000;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: 'sku,model,den' });
    if (error) throw error;
    upserted += chunk.length;
  }
  return { upserted };
}

/**
 * API Handler
 * GET /api/ozon/sync?date=2025-08-21&days=7
 * GET /api/ozon/sync?from=2025-08-15&to=2025-08-21
 * &preview=1  仅返回映射，不入库
 * &debug=1    回显部分原始 Ozon 数据
 * &dry=1      只计算不写库
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, msg: 'Method Not Allowed' });
    }

    const {
      OZON_CLIENT_ID,
      OZON_API_KEY,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      OZON_TABLE
    } = process.env;

    if (!OZON_CLIENT_ID || !OZON_API_KEY) {
      return res.status(500).json({ ok: false, msg: 'Missing OZON_CLIENT_ID or OZON_API_KEY' });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ ok: false, msg: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }

    const table = OZON_TABLE || 'ozon_product_report_wide';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { from, to } = parseDateRange(req.query);
    const preview = String(req.query.preview || '0') === '1';
    const debug = String(req.query.debug || '0') === '1';
    const dry = String(req.query.dry || '0') === '1';
    const hasPremium = String(req.query.premium || '0') === '1'; // 如果开通 Premium，可传 &premium=1

    // 拉 Ozon
    const raw = await fetchOzonAnalytics({
      clientId: OZON_CLIENT_ID,
      apiKey: OZON_API_KEY,
      date_from: from,
      date_to: to,
      hasPremium
    });

    // 映射为入库行
    const mapped = raw.map(r => mapRowToDb(r, hasPremium));
    const rows = dedupeByKey(mapped);
    const dates = Array.from(new Set(rows.map(r => r.den))).sort();

    if (preview || debug || dry) {
      const payload = {
        ok: true,
        from,
        to,
        count: rows.length,
        table,
        dates,
      };
      if (preview) payload.rows = rows.slice(0, 100);
      if (debug) {
        payload.metrics_used = METRICS;
        payload.sample_raw = raw.slice(0, 2);
        payload.sample_rows = rows.slice(0, 2);
      }
      return res.status(200).json(payload);
    }

    // 入库
    const { upserted } = await upsertRows({ supabase, table, rows });

    return res.status(200).json({
      ok: true,
      table,
      from,
      to,
      dates,
      count: rows.length,
      upserted
    });
  } catch (err) {
    return res.status(500).json({ ok: false, msg: err?.message || 'Unknown error' });
  }
}


