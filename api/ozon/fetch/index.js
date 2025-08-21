const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

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
    const RAW_TABLE = OZON_TABLE_NAME || 'ozon_product_report_wide';
    const TABLE = normalizeTableName(RAW_TABLE);

    // 计算昨天日期（GMT+8）
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8); // 转为 GMT+8
    d.setUTCDate(d.getUTCDate() - 1);
    const date = d.toISOString().slice(0, 10);

    // 请求 Ozon Analytics API
    const body = {
      date_from: date,
      date_to: date,
      dimension: ['sku', 'offer_id', 'title', 'brand', 'category_1', 'category_2', 'category_3'],
      metrics: ['hits_view', 'hits_view_search', 'hits_view_pdp', 'hits_tocart_search', 'hits_tocart_pdp', 'ordered_units', 'delivered_units', 'revenue', 'cancelled_units', 'returned_units']
    };

    const resp = await fetch('https://api-seller.ozon.ru/v1/analytics/data', {
      method: 'POST',
      headers: {
        'Client-Id': OZON_CLIENT_ID,
        'Api-Key': OZON_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(json.message || resp.statusText);
    }

    const data = json.result?.data || [];

    const dimMap = {
      sku: 'sku',
      offer_id: 'model',
      title: 'tovary',
      brand: 'brend',
      category_1: 'kategoriya_1_urovnya',
      category_2: 'kategoriya_2_urovnya',
      category_3: 'kategoriya_3_urovnya'
    };
    const metricMap = {
      hits_view: 'voronka_prodazh_pokazy_vsego',
      hits_view_search: 'voronka_prodazh_pokazy_v_poiske_i_kataloge',
      hits_view_pdp: 'voronka_prodazh_posescheniya_kartochki_tovara',
      hits_tocart_search: 'voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu',
      hits_tocart_pdp: 'voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu',
      ordered_units: 'voronka_prodazh_zakazano_tovarov',
      delivered_units: 'voronka_prodazh_dostavleno_tovarov',
      revenue: 'prodazhi_zakazano_na_summu',
      cancelled_units: 'voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_',
      returned_units: 'voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_'
    };

    const rows = data.map(item => {
      const row = { den: date };
      for (const d of item.dimensions || []) {
        const key = dimMap[d.id] || dimMap[d.name];
        if (key) row[key] = d.value ?? d.name;
      }
      for (const m of item.metrics || []) {
        const key = metricMap[m.id];
        if (key) row[key] = Number(m.value);
      }
      if (!row.model) row.model = row.sku;
      return row;
    }).filter(r => r.sku);

    if (rows.length === 0) {
      return res.status(200).json({ ok: true, count: 0, table: TABLE });
    }

    const { error } = await supabase.schema('public').from(TABLE).upsert(rows, { onConflict: 'sku,model,den' });
    if (error) {
      throw new Error(error.message);
    }

    res.status(200).json({ ok: true, count: rows.length, table: TABLE });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
};

