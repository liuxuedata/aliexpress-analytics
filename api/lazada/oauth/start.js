const { createClient } = require('@supabase/supabase-js');
const { createSignedState } = require('../../../lib/lazada-oauth-state');

const AUTHORIZE_ENDPOINT = 'https://auth.lazada.com/oauth/authorize';

function getEnvOrThrow(key, hint) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured${hint ? ` (${hint})` : ''}`);
  }
  return value;
}

function resolveSiteId(query = {}) {
  return query.siteId || query.site || query.site_id || query.siteid;
}

function createSupabaseClient(factory = createClient) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return factory(url, key, { auth: { persistSession: false } });
}

async function fetchSiteConfig(supabase, siteId) {
  const { data, error } = await supabase
    .schema('public')
    .from('site_configs')
    .select('id, platform, display_name, name, config_json')
    .eq('id', siteId)
    .limit(1);

  if (error) {
    throw new Error(`Supabase 查询站点配置失败：${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

function sanitizeReturnTo(value, host) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const hostOrigin = host ? `https://${host}` : undefined;
    const target = new URL(trimmed, hostOrigin);
    if (target.host && host && target.host.toLowerCase() !== host.toLowerCase()) {
      return null;
    }
    if (!target.pathname) return null;
    return target.pathname + target.search + target.hash;
  } catch (error) {
    return null;
  }
}

function buildAuthorizeUrl({ appKey, redirectUri, state, region, language }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    state,
    force_auth: 'true'
  });

  if (region) {
    params.set('region', region);
  }
  if (language) {
    params.set('language', language);
  }

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

function createHandler({ clientFactory = createClient, stateFactory = createSignedState } = {}) {
  return async function handler(req, res) {
    if (req.method && req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      });
    }

    try {
      const query = req.query || {};
      const siteId = resolveSiteId(query);
      if (!siteId) {
        throw new Error('缺少 siteId 参数');
      }

      const appKey = getEnvOrThrow('LAZADA_APP_KEY');
      const redirectUri = getEnvOrThrow('LAZADA_REDIRECT_URI');

      const supabase = createSupabaseClient(clientFactory);
      const site = await fetchSiteConfig(supabase, siteId);
      if (!site) {
        const err = new Error(`未找到站点：${siteId}`);
        err.code = 'SITE_NOT_FOUND';
        throw err;
      }
      if (site.platform && site.platform !== 'lazada') {
        const err = new Error('该站点不是 Lazada 平台，无法发起授权');
        err.code = 'INVALID_PLATFORM';
        throw err;
      }

      const returnTo = sanitizeReturnTo(query.returnTo, req.headers?.host);
      const statePayload = {
        siteId,
        platform: site.platform || 'lazada',
        displayName: site.display_name || site.name || siteId
      };
      if (returnTo) {
        statePayload.returnTo = returnTo;
      }

      const state = stateFactory(statePayload);
      const config = site.config_json || {};
      const region = config.region || config.country || null;
      const language = config.language || null;
      const authorizeUrl = buildAuthorizeUrl({
        appKey,
        redirectUri,
        state,
        region,
        language
      });

      return res.status(200).json({
        success: true,
        data: {
          url: authorizeUrl,
          state,
          site: {
            id: site.id,
            display_name: site.display_name || site.name || site.id
          }
        }
      });
    } catch (error) {
      const status = error?.code === 'SITE_NOT_FOUND' ? 404 : 400;
      const payload = {
        success: false,
        message: error.message || 'Failed to create Lazada authorization URL'
      };
      if (error?.code) {
        payload.code = error.code;
      }
      return res.status(status).json(payload);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.sanitizeReturnTo = sanitizeReturnTo;
