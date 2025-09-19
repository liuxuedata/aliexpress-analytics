const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { normalizeRange, syncOzonOrders } = require('../../../lib/ozon-orders');

function toBoolean(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const lowered = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(lowered)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(lowered)) return false;
  return defaultValue;
}

function resolveSiteId(query) {
  return query.siteId || query.site_id || query.site || 'ozon_main';
}

function createSupabaseClient(clientFactory) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env');
  }
  return clientFactory(url, key, { auth: { persistSession: false } });
}

function getOzonCredentials() {
  const { OZON_CLIENT_ID, OZON_API_KEY } = process.env;
  if (!OZON_CLIENT_ID || !OZON_API_KEY) {
    throw new Error('Missing OZON_CLIENT_ID or OZON_API_KEY');
  }
  return { clientId: OZON_CLIENT_ID, apiKey: OZON_API_KEY };
}

function createHandler({ fetchImpl = fetch, clientFactory = createClient } = {}) {
  return async function handler(req, res) {
    const traceId = `ozon-orders-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
      const creds = getOzonCredentials();

      const { orders, summary } = await syncOzonOrders({
        fetchImpl,
        supabase,
        creds,
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
          sync: {
            ...summary,
            siteId,
            range: { from, to }
          }
        },
        metadata: {
          siteId,
          range: { from, to },
          count: Array.isArray(orders) ? orders.length : 0,
          limit
        },
        traceId
      });
    } catch (error) {
      console.error(`[${traceId}] Ozon orders handler failed`, error);
      const statusCode = error?.code === 'SITE_NOT_FOUND'
        ? 400
        : (Number.isInteger(error?.status) ? error.status : 500);

      const payload = {
        success: false,
        message: error.message || 'Ozon orders sync failed',
        traceId
      };

      if (error?.code === 'SITE_NOT_FOUND' && Array.isArray(error?.missingSites)) {
        payload.details = { missingSites: error.missingSites };
      }

      return res.status(statusCode).json(payload);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
