const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { normalizeRange } = require('../../../lib/lazada-utils');
const { syncLazadaStats } = require('../../../lib/lazada-stats');

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

function createHandler({ fetchImpl = fetch, clientFactory = createClient, syncStats = syncLazadaStats } = {}) {
  return async function handler(req, res) {
    const traceId = `lazada-stats-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
      const shouldSync = toBoolean(query.sync, true);

      const supabase = createSupabaseClient(clientFactory);
      const { daily, products, summary, availability } = await syncStats({
        fetchImpl,
        supabase,
        siteId,
        from,
        to,
        shouldSync
      });

      return res.status(200).json({
        success: true,
        data: {
          daily,
          products,
          summary
        },
        metadata: {
          siteId,
          range: { from, to },
          availableFields: availability?.availableFields || [],
          missingFields: availability?.missingFields || []
        },
        traceId
      });
    } catch (error) {
      console.error(`[${traceId}] Lazada stats handler failed`, error);
      const status = error?.code === 'SITE_NOT_FOUND'
        ? 400
        : Number.isInteger(error?.status) ? error.status : 500;

      const payload = {
        success: false,
        message: error.message || 'Lazada stats sync failed',
        traceId
      };

      if (error?.code === 'SITE_NOT_FOUND' && Array.isArray(error?.missingSites)) {
        payload.details = { missingSites: error.missingSites };
      }

      return res.status(status).json(payload);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
