const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { storeTokenRecord } = require('../../../lib/lazada-auth');

const TOKEN_ENDPOINT = 'https://auth.lazada.com/rest/auth/token/create';
const TOKEN_PATH = '/rest/auth/token/create';

function fetchLazada(endpoint, options) {
  if (typeof global.fetch === 'function') {
    return global.fetch(endpoint, options);
  }
  const nodeFetch = require('node-fetch');
  return nodeFetch(endpoint, options);
}

function getEnvOrThrow(key, hint) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured${hint ? ` (${hint})` : ''}`);
  }
  return value;
}

function buildLazadaSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  let base = TOKEN_PATH;
  for (const key of sortedKeys) {
    base += key + params[key];
  }
  return crypto.createHmac('sha256', secret).update(base).digest('hex').toUpperCase();
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function decodeState(state) {
  if (!state) return {};
  if (typeof state !== 'string') return state;
  const trimmed = state.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(decodeURIComponent(trimmed));
  } catch (err) {
    try {
      return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
    } catch (err2) {
      const params = new URLSearchParams(trimmed);
      if (params.has('siteId')) {
        return { siteId: params.get('siteId') };
      }
      if (params.has('site')) {
        return { siteId: params.get('site') };
      }
      return { siteId: trimmed };
    }
  }
}

async function persistTokens({ supabase, siteId, payload }) {
  if (!supabase || !siteId || !payload) return false;
  const expiresIn = Number(payload.expires_in || payload.expire_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  try {
    await storeTokenRecord(supabase, {
      siteId,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt,
      meta: {
        account_id: payload.account_id || payload.country_user_info?.userId || null,
        country: payload.country || payload.country_user_info?.country || null,
        state: payload.country_user_info || null
      }
    });
    return true;
  } catch (error) {
    console.error('[lazada] Failed to persist tokens', error);
    return false;
  }
}

async function exchangeAuthorizationCode(code, redirectUri) {
  const appKey = getEnvOrThrow('LAZADA_APP_KEY');
  const appSecret = getEnvOrThrow('LAZADA_APP_SECRET');

  const timestamp = Date.now().toString();
  const params = {
    app_key: appKey,
    code,
    redirect_uri: redirectUri,
    sign_method: 'sha256',
    timestamp,
  };

  params.sign = buildLazadaSignature(params, appSecret);

  const search = new URLSearchParams(params);
  const response = await fetchLazada(`${TOKEN_ENDPOINT}?${search.toString()}`, {
    method: 'POST',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || response.statusText;
    const error = new Error(message || 'Failed to exchange Lazada auth code');
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { code, state, error, error_description: errorDescription } = req.query || {};

  if (error) {
    return res.status(400).json({
      ok: false,
      success: false,
      error,
      message: errorDescription || 'Lazada authorization failed',
      state: state || null,
    });
  }

  if (!code) {
    return res.status(400).json({ ok: false, success: false, error: 'Missing authorization code' });
  }

  try {
    const redirectUri = getEnvOrThrow('LAZADA_REDIRECT_URI', 'must match Lazada app settings');
    const tokenResponse = await exchangeAuthorizationCode(code, redirectUri);

    const safeData = tokenResponse && typeof tokenResponse === 'object'
      ? {
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          expires_in: tokenResponse.expires_in,
          refresh_expires_in: tokenResponse.refresh_expires_in,
          account_platform: tokenResponse.account_platform,
          country_user_info: tokenResponse.country_user_info,
        }
      : null;

    const supabase = createSupabaseClient();
    const decodedState = decodeState(state);
    const siteId = decodedState?.siteId || decodedState?.site || null;
    const persisted = await persistTokens({ supabase, siteId, payload: tokenResponse });

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'Lazada authorization completed',
      data: {
        state: state || null,
        siteId: siteId || null,
        tokens: safeData,
        raw: tokenResponse,
        persisted
      },
    });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    const body = {
      ok: false,
      success: false,
      error: err.message || 'Failed to complete Lazada authorization',
    };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(status).json(body);
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.buildLazadaSignature = buildLazadaSignature;
module.exports.exchangeAuthorizationCode = exchangeAuthorizationCode;
