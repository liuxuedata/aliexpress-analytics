const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchFromOzon(days) {
  const { OZON_CLIENT_ID, OZON_API_KEY } = process.env;
  if (!OZON_CLIENT_ID || !OZON_API_KEY) throw new Error('Missing OZON_CLIENT_ID or OZON_API_KEY');

  const dimMap = {
    sku: 'product_id',
    offer_id: 'model',
    title: 'product_title',
    brand: 'brand',
    category_1: 'category_1',
    category_2: 'category_2',
    category_3: 'category_3'
  };
  const metricMap = {
    hits_view: 'exposure',
    hits_view_search: 'impressions_search',
    hits_view_pdp: 'pageviews',
    hits_tocart_search: 'add_to_cart_from_search',
    hits_tocart_pdp: 'add_to_cart_from_pdp',
    ordered_units: 'ordered_units',
    delivered_units: 'delivered_units',
    revenue: 'revenue',
    cancelled_units: 'cancelled_units',
    returned_units: 'returned_units'
  };

  const rows = [];
  const now = new Date();
  now.setUTCHours(now.getUTCHours() + 8);
  now.setUTCDate(now.getUTCDate() - 1);

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const body = {
      date_from: dateStr,
      date_to: dateStr,
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
    for (const item of data) {
      const row = { stat_date: dateStr };
      for (const d of item.dimensions || []) {
        const key = dimMap[d.id] || dimMap[d.name];
        if (key) row[key] = d.value ?? d.name;
      }
      for (const m of item.metrics || []) {
        const key = metricMap[m.id];
        if (key) row[key] = Number(m.value);
      }
      if (row.product_id) rows.push(row);
    }
  }
  return rows;
}

function pickCoreFields(row) {
  return {
    product_id: row.product_id,
    stat_date: row.stat_date,
    platform: row.platform,
    site_id: row.site_id
  };
}

module.exports = async function handler(req, res) {
  const result = { ok: false, fetched: 0, upserting: 0, upserted: 0, skipped: 0, samples: [], message: '' };
  if (req.method && req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    result.message = 'method not allowed';
    return res.status(405).json(result);
  }
  try {
    const days = Math.max(1, parseInt(req.query?.days, 10) || 1);
    const siteId = req.query?.store_id || req.query?.site_id || 'demo';

    const raw = await fetchFromOzon(days);
    result.fetched = raw.length;

    const normalized = raw.map(r => ({
      ...r,
      site_id: siteId,
      source: 'ozon',
      platform: 'ozon'
    })).filter(r => {
      const ok = r.product_id && r.stat_date;
      if (!ok) result.skipped++;
      return ok;
    });

    result.upserting = normalized.length;
    result.samples = normalized.slice(0, 3).map(pickCoreFields);

    if (normalized.length === 0) {
      result.message = result.fetched === 0 ? 'Ozon 返回 0 条' : '主键缺失';
      return res.status(400).json(result);
    }

    const supabase = supa();
    const TABLE = 'ozon_daily';

    const { error, count } = await supabase
      .from(TABLE)
      .upsert(normalized, { onConflict: 'site_id,source,product_id,stat_date', ignoreDuplicates: false })
      .select('product_id', { count: 'exact', head: true });

    if (error) {
      const msg = error.message || '';
      if (/permission denied|rls/i.test(msg)) result.message = 'RLS/权限问题';
      else if (/column .* does not exist/i.test(msg)) result.message = '表结构不匹配';
      else result.message = msg;
      return res.status(500).json(result);
    }

    result.upserted = count || 0;
    result.ok = true;
    if (result.upserted === 0) {
      result.message = '全为已存在数据（幂等）';
    }
    return res.status(200).json(result);
  } catch (e) {
    result.message = e?.message || '未知错误';
    return res.status(500).json(result);
  }
};

