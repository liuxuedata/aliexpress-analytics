const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchFromOzon() {
  const { OZON_CLIENT_ID, OZON_API_KEY } = process.env;
  if (!OZON_CLIENT_ID || !OZON_API_KEY) throw new Error('Missing Ozon env');

  // compute yesterday date in GMT+8
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 8);
  d.setUTCDate(d.getUTCDate() - 1);
  const date = d.toISOString().slice(0, 10);

  const limit = 1000;
  const baseBody = {
    date_from: date,
    date_to: date,
    dimension: ['sku'],
    metrics: ['hits_view'],
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
      body: JSON.stringify(baseBody)
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.message || resp.statusText);
    const chunk = json.result?.data || [];
    all.push(...chunk);
    if (chunk.length < limit) break;
    baseBody.offset += limit;
  }
  // map to simple rows
  const rows = all.map(item => {
    const row = { stat_date: date };
    for (const d of item.dimensions || []) {
      if (d.id === 'sku' || d.name === 'sku') row.product_id = d.value || d.name;
    }
    return row;
  });
  return rows;
}

function mapToRow(item) {
  return {
    product_id: item.product_id,
    stat_date: item.stat_date,
    platform: item.platform || 'ozon',
    site_id: item.site_id || null,
    source: item.source || null
  };
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

  try {
    const raw = await fetchFromOzon();
    result.fetched = raw.length;

    const normalized = raw.map(mapToRow).filter(r => {
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
      else if (/does not exist/i.test(msg)) result.message = '表结构不匹配';
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

