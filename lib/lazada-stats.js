const { normalizeRange, toNumber, toCurrency } = require('./lazada-utils');
const { ensureAccessToken } = require('./lazada-auth');
const { resolveApiHost, callLazadaApi } = require('./lazada-api');
const { getSiteConfig } = require('./lazada-orders');

const DAILY_FIELDS = ['impressions', 'visitors', 'add_to_cart', 'orders', 'payments', 'revenue'];

function mapDailyRow(record, { siteId, platform = 'lazada' }) {
  if (!record) return null;
  const statDate = record.date || record.stat_date || record.day || record.ds;
  if (!statDate) return null;
  const currency = record.currency || record.currency_code || 'CNY';
  const channel = record.channel || record.traffic_channel || 'organic';

  return {
    site: siteId,
    platform,
    channel,
    stat_date: statDate,
    impressions: toNumber(record.impressions),
    visitors: toNumber(record.visitors || record.uv),
    add_to_cart: toNumber(record.add_to_cart || record.additions || record.add_to_cart_count),
    orders: toNumber(record.orders || record.order_count),
    payments: toNumber(record.payments || record.paid_orders || record.payment_count),
    revenue: toCurrency(record.revenue || record.gmv || record.paid_amount),
    currency
  };
}

function mapProductRow(record, { siteId, platform = 'lazada' }) {
  if (!record) return null;
  const statDate = record.date || record.stat_date || record.day || record.ds;
  if (!statDate) return null;
  const sku = record.sku || record.item_sku || record.seller_sku;
  if (!sku) return null;
  const currency = record.currency || 'CNY';

  return {
    site: siteId,
    platform,
    sku,
    stat_date: statDate,
    product_name: record.name || record.product_name || null,
    impressions: toNumber(record.impressions),
    visitors: toNumber(record.visitors || record.uv),
    add_to_cart: toNumber(record.add_to_cart || record.additions || record.add_to_cart_count),
    orders: toNumber(record.orders || record.order_count),
    payments: toNumber(record.payments || record.paid_orders || record.payment_count),
    revenue: toCurrency(record.revenue || record.gmv || record.paid_amount),
    currency
  };
}

async function fetchMetrics({ fetchImpl, supabase, siteConfig, siteId, from, to }) {
  const access = await ensureAccessToken({ supabase, siteId, fetchImpl });
  const host = resolveApiHost(siteConfig);

  const [dailyPayload, productPayload] = await Promise.all([
    callLazadaApi({
      fetchImpl,
      accessToken: access.accessToken,
      host,
      path: '/analytics/site/metrics/get',
      params: {
        start_date: from.slice(0, 10),
        end_date: to.slice(0, 10)
      }
    }),
    callLazadaApi({
      fetchImpl,
      accessToken: access.accessToken,
      host,
      path: '/analytics/product/metrics/get',
      params: {
        start_date: from.slice(0, 10),
        end_date: to.slice(0, 10)
      }
    }).catch(err => {
      console.warn('[lazada] product metrics unavailable', err.message);
      return { data: [] };
    })
  ]);

  const dailyRecords = Array.isArray(dailyPayload?.data?.records) ? dailyPayload.data.records
    : Array.isArray(dailyPayload?.data) ? dailyPayload.data
    : Array.isArray(dailyPayload?.result) ? dailyPayload.result
    : [];

  const productRecords = Array.isArray(productPayload?.data?.records) ? productPayload.data.records
    : Array.isArray(productPayload?.data) ? productPayload.data
    : Array.isArray(productPayload?.result) ? productPayload.result
    : [];

  return {
    access,
    dailyRecords,
    productRecords
  };
}

async function persistDailyMetrics(supabase, rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .schema('public')
    .from('site_metrics_daily')
    .upsert(rows, { onConflict: 'site,channel,stat_date' });

  if (error) {
    throw new Error(`Supabase 写入站点指标失败：${error.message}`);
  }
  return rows.length;
}

async function persistProductMetrics(supabase, rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .schema('public')
    .from('product_metrics_daily')
    .upsert(rows, { onConflict: 'site,sku,stat_date' });
  if (error) {
    throw new Error(`Supabase 写入产品指标失败：${error.message}`);
  }
  return rows.length;
}

async function queryDailyMetrics(supabase, { siteId, from, to, limit = 60 }) {
  let builder = supabase
    .schema('public')
    .from('site_metrics_daily')
    .select('*')
    .eq('platform', 'lazada')
    .eq('site', siteId)
    .order('stat_date', { ascending: false })
    .limit(limit);

  if (from) builder = builder.gte('stat_date', from.slice(0, 10));
  if (to) builder = builder.lte('stat_date', to.slice(0, 10));

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Supabase 查询站点指标失败：${error.message}`);
  }
  return data || [];
}

async function queryProductMetrics(supabase, { siteId, from, to, limit = 50 }) {
  let builder = supabase
    .schema('public')
    .from('product_metrics_daily')
    .select('*')
    .eq('platform', 'lazada')
    .eq('site', siteId)
    .order('stat_date', { ascending: false })
    .limit(limit);

  if (from) builder = builder.gte('stat_date', from.slice(0, 10));
  if (to) builder = builder.lte('stat_date', to.slice(0, 10));

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Supabase 查询产品指标失败：${error.message}`);
  }
  return data || [];
}

function buildSummary(rows) {
  const summary = {
    impressions: 0,
    visitors: 0,
    add_to_cart: 0,
    orders: 0,
    payments: 0,
    revenue: 0,
    currency: null,
    days: rows.length
  };

  rows.forEach(row => {
    summary.impressions += toNumber(row.impressions);
    summary.visitors += toNumber(row.visitors);
    summary.add_to_cart += toNumber(row.add_to_cart);
    summary.orders += toNumber(row.orders);
    summary.payments += toNumber(row.payments);
    summary.revenue += toCurrency(row.revenue);
    if (!summary.currency && row.currency) {
      summary.currency = row.currency;
    }
  });

  summary.impressions = toNumber(summary.impressions);
  summary.visitors = toNumber(summary.visitors);
  summary.add_to_cart = toNumber(summary.add_to_cart);
  summary.orders = toNumber(summary.orders);
  summary.payments = toNumber(summary.payments);
  summary.revenue = toCurrency(summary.revenue);

  return summary;
}

function deriveFieldAvailability(rows) {
  const available = new Set();
  rows.forEach(row => {
    DAILY_FIELDS.forEach(field => {
      const value = toNumber(row[field], 0);
      if (Number.isFinite(value) && value !== 0) {
        available.add(field);
      }
    });
  });
  const availableFields = Array.from(available);
  const missingFields = DAILY_FIELDS.filter(field => !available.has(field));
  return { availableFields, missingFields };
}

async function syncLazadaStats({
  fetchImpl,
  supabase,
  siteId,
  from,
  to,
  shouldSync = true,
  limit = 60
}) {
  if (!supabase) {
    throw new Error('Supabase client is required');
  }
  if (!siteId) {
    throw new Error('缺少 siteId 参数');
  }

  const { from: normalizedFrom, to: normalizedTo } = normalizeRange(from, to);
  const siteConfig = await getSiteConfig(supabase, siteId);
  if (!siteConfig) {
    const err = new Error(`未找到 Lazada 站点配置：${siteId}`);
    err.code = 'SITE_NOT_FOUND';
    err.missingSites = [siteId];
    throw err;
  }

  if (shouldSync) {
    const { dailyRecords, productRecords } = await fetchMetrics({
      fetchImpl,
      supabase,
      siteConfig,
      siteId,
      from: normalizedFrom,
      to: normalizedTo
    });

    const mappedDaily = (dailyRecords || [])
      .map(record => mapDailyRow(record, { siteId }))
      .filter(Boolean)
      .map(row => ({ ...row, platform: 'lazada' }));

    const mappedProducts = (productRecords || [])
      .map(record => mapProductRow(record, { siteId }))
      .filter(Boolean)
      .map(row => ({ ...row, platform: 'lazada' }));

    if (mappedDaily.length) {
      await persistDailyMetrics(supabase, mappedDaily);
    }
    if (mappedProducts.length) {
      await persistProductMetrics(supabase, mappedProducts);
    }
  }

  const daily = await queryDailyMetrics(supabase, {
    siteId,
    from: normalizedFrom,
    to: normalizedTo,
    limit
  });
  const products = await queryProductMetrics(supabase, {
    siteId,
    from: normalizedFrom,
    to: normalizedTo,
    limit: 100
  });
  const summary = buildSummary(daily);
  const availability = deriveFieldAvailability(daily);

  return {
    daily,
    products,
    summary,
    availability
  };
}

module.exports = {
  syncLazadaStats,
  mapDailyRow,
  mapProductRow,
  buildSummary
};
