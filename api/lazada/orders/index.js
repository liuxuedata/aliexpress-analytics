const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { normalizeRange, syncLazadaOrders } = require('../../../lib/lazada-orders');

const AVAILABLE_FIELDS = [
  'order_no',
  'status',
  'settlement_status',
  'settlement_date',
  'placed_at',
  'currency',
  'subtotal',
  'discount',
  'shipping_fee',
  'tax',
  'total',
  'cost_of_goods',
  'logistics_cost',
  'order_items'
];

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(lowered)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(lowered)) return false;
  return defaultValue;
}

function resolveSiteId(query = {}) {
  return query.siteId || query.site_id || query.site || query.siteid;
}

function createSupabaseClient(factory = createClient) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return factory(url, key, { auth: { persistSession: false } });
}

function createHandler({ fetchImpl = fetch, clientFactory = createClient, syncOrders = syncLazadaOrders } = {}) {
  return async function handler(req, res) {
    const traceId = `lazada-orders-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    if (req.method && req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        success: false,
        message: 'Method not allowed',
        traceId
      });
    }

    try {
      const query = req.query || {};
      const siteId = resolveSiteId(query);
      if (!siteId) {
        throw new Error('缺少 siteId 参数');
      }

      const { from, to } = normalizeRange(query.from, query.to);
      const limitParam = parseInt(query.limit, 10);
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200;
      const shouldSync = toBoolean(query.sync, true);

      const supabase = createSupabaseClient(clientFactory);
      const { orders, summary } = await syncOrders({
        fetchImpl,
        supabase,
        siteId,
        from,
        to,
        limit,
        shouldSync
      });

      return res.status(200).json({
        success: true,
        data: {
          orders,
          sync: summary
        },
        metadata: {
          siteId,
          range: { from, to },
          count: Array.isArray(orders) ? orders.length : 0,
          limit,
          availableFields: AVAILABLE_FIELDS,
          missingFields: []
        },
        traceId
      });
    } catch (error) {
      console.error(`[${traceId}] Lazada orders handler failed`, error);
      const status = error?.code === 'SITE_NOT_FOUND'
        ? 400
        : Number.isInteger(error?.status) ? error.status : 500;

      const payload = {
        success: false,
        message: error.message || 'Lazada orders sync failed',
        traceId
      };
      if (error?.code) {
        payload.code = error.code;
      }

      if (error?.code === 'SITE_NOT_FOUND' && Array.isArray(error?.missingSites)) {
        payload.details = { missingSites: error.missingSites };
      }

      return res.status(status).json(payload);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
