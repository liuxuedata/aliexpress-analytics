// /api/ozon/sync.js —— Ozon → Supabase 宽表（俄文列名）
// 运行环境：Vercel Node，无需额外依赖；若本地旧 Node 版本没有全局 fetch，可安装 node-fetch@2 并取消下行注释。
// const fetch = require('node-fetch');
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

// 将一条 Ozon 返回映射为库里的一行
function mapOzonItemToRow(item, den) {
  const row = { den };

  // 维度：常见返回形态为 [{ id: 'SKU', name: '商品名' }, ...]
  if (Array.isArray(item.dimensions)) {
    // 兼容：若服务端只返回一个主要维度（sku+name），也能取到
    for (const d of item.dimensions) {
      // d 可能是 {id, name} 或 {id: 'title', value: 'xxx'}
      // 优先用 {id:'sku'|'offer_id'|'title'... , value/name:实际值}
      const id = (d.id || '').toString();
      const key = DIM_COL[id];
      if (key) {
        // 标准形态 value/name 二选一
        row[key] = (d.value ?? d.name ?? '').toString();
      }
    }

    // 如果只有一个维度对象（常见：{id: <SKU>, name: <标题>})
    if (!row.sku && item.dimensions[0]) {
      row.sku = String(item.dimensions[0].id ?? item.dimensions[0].value ?? '').trim();
    }
    if (!row.tovary && item.dimensions[0]) {
      row.tovary = String(item.dimensions[0].name ?? '').trim();
    }
  }

  // 指标：常见是纯数字数组，顺序与请求一致；也兼容 [{id,value}] 形式
  if (Array.isArray(item.metrics)) {
    // 纯数字序列
    if (typeof item.metrics[0] !== 'object') {
      for (let i = 0; i < REQ_METRICS.length; i++) {
        const k = REQ_METRICS[i];
        const col = METRIC_COL[k];
        if (!col) continue;
        const v = Number(item.metrics[i] ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    } else {
      // [{id,value}] 形式
      for (const m of item.metrics) {
        const k = m.id;
        const col = METRIC_COL[k];
        if (!col) continue;
        const v = Number(m.value ?? 0);
        row[col] = Number.isFinite(v) ? v : 0;
      }
    }
  }

  // 主键与必填兜底
  if (!row.model) row.model = row.sku || '';    // 主键2
  if (!row.tovary) row.tovary = row.model || '';// NOT NULL
  if (!row.sku || !row.model || !row.den) return null;

  return row;
}

// ---------- 入口 ----------
module.exports = async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, msg: 'method not allowed' });
  }

  try {
    const { OZON_CLIENT_ID, OZON_API_KEY, OZON_TABLE_NAME } = process.env;
    if (!OZON_CLIENT_ID || !OZON_API_KEY) {
      throw new Error('Missing OZON_CLIENT_ID or OZON_API_KEY');
    }
    const supabase = supa();
    const TABLE = normalizeTableName(OZON_TABLE_NAME || 'ozon_product_report_wide');

    // 查询参数
    const q = req.query || {};
    const date = (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) ? q.date : yestInCST8();
    const preview = isTrue(q.preview);
    const debug = isTrue(q.debug);
    const limit = Math.min(Number(q.limit) || 1000, 1000);

    // 1) 拉 Ozon（分页）
    const body = {
      date_from: date,
      date_to: date,
      dimension: REQ_DIMENSIONS, // 如遇权限/口径问题，可临时改为 ['sku'] 再试
      metrics: REQ_METRICS,
      limit,
      offset: 0
    };

    const all = [];
    while (true) {
      const resp = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
        method: 'POST',
        headers: {
          'Client-Id': OZON_CLIENT_ID,
          'Api-Key': OZON_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const text = await resp.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { parse_error: text?.slice(0, 400) }; }

      if (!resp.ok) {
        return res.status(resp.status).json({ ok: false, msg: json?.message || resp.statusText, payload: json });
      }

      const chunk = json?.result?.data || json?.data || json?.rows || [];
      all.push(...chunk);
      if (chunk.length < limit) break;
      body.offset += limit;
    }

    // 2) 映射为宽表行
    const rows = [];
    const skipped = [];
    for (const it of all) {
      const r = mapOzonItemToRow(it, date);
      if (r) rows.push(r);
      else skipped.push(it?.dimensions?.[0] || {});
    }

    // 3) 调试/预览
    if (debug) {
      return res.status(200).json({
        ok: true,
        fetched: all.length,
        mapped: rows.length,
        sample_raw: all.slice(0, 2),
        sample_rows: rows.slice(0, 2),
        requestBody: body
      });
    }
    if (preview) {
      return res.status(200).json({ ok: true, count: rows.length, table: TABLE, rows: rows.slice(0, 5) });
    }
    if (rows.length === 0) {
      return res.status(200).json({ ok: true, count: 0, table: TABLE });
    }

    // 4) 入库（幂等 upsert）
    const { error } = await supabase
      .schema('public')
      .from(TABLE)
      .upsert(rows, { onConflict: 'sku,model,den' });
    if (error) throw new Error(error.message);

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
      latestDen,
      updated: latestDen === date
    });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message || 'unknown error' });
  }
};

