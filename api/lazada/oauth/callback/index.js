const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { storeTokenRecord } = require('../../../../lib/lazada-auth');
const { decodeState } = require('../../../../lib/lazada-oauth-state');
const { findKeyDeep } = require('../../../../lib/find-key-deep');

const TOKEN_ENDPOINT = 'https://auth.lazada.com/rest/auth/token/create';
const TOKEN_PATH = '/rest/auth/token/create';

const ACCESS_KEYS = ['access_token', 'accessToken', 'token'];
const REFRESH_KEYS = ['refresh_token', 'refreshToken', 'refresh'];
const EXPIRES_IN_KEYS = ['expires_in', 'expiresIn', 'expire_in'];
const REFRESH_EXPIRES_IN_KEYS = ['refresh_expires_in', 'refreshExpiresIn'];
const ACCOUNT_ID_KEYS = ['account_id', 'accountId', 'seller_id', 'sellerId'];
const COUNTRY_KEYS = ['country', 'region'];
const STATE_KEYS = ['country_user_info', 'account_user_info'];

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
  if (!url) {
    const err = new Error('SUPABASE_URL is not configured (required to persist Lazada tokens)');
    err.code = 'SUPABASE_URL_MISSING';
    err.status = 500;
    throw err;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY is not configured。Lazada OAuth 回调需要 Service Role Key 才能写入 integration_tokens 表');
    err.code = 'SUPABASE_SERVICE_ROLE_KEY_MISSING';
    err.status = 500;
    throw err;
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function coerceString(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = coerceString(item);
      if (result) return result;
    }
  }
  return null;
}

function coerceNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickDeepValue(payload, keys, transformer) {
  const result = findKeyDeep(payload, keys);
  if (!result) return null;
  return transformer(result.value);
}

function pickDeepString(payload, keys) {
  return pickDeepValue(payload, keys, coerceString);
}

function pickDeepNumber(payload, keys) {
  return pickDeepValue(payload, keys, coerceNumber);
}

function firstObjectMatch(payload, keys) {
  const result = findKeyDeep(payload, keys);
  if (!result) return null;
  const value = result.value;
  if (!value || typeof value !== 'object') return null;
  return value;
}

function redactTokens(input, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) {
    return '[depth-exceeded]';
  }
  if (input == null) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactTokens(item, depth + 1, maxDepth));
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && /token/i.test(key)) {
      const trimmed = value.trim();
      if (!trimmed) {
        output[key] = trimmed;
      } else if (trimmed.length <= 8) {
        output[key] = `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
      } else {
        output[key] = `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
      }
      continue;
    }
    output[key] = redactTokens(value, depth + 1, maxDepth);
  }
  return output;
}

function logTokenResponse(envelope, tokenPayload) {
  try {
    const safeEnvelope = redactTokens(envelope);
    const safePayload = tokenPayload === envelope ? safeEnvelope : redactTokens(tokenPayload);
    console.info('[Lazada OAuth] token response envelope:', JSON.stringify(safeEnvelope));
    if (tokenPayload && typeof tokenPayload === 'object') {
      console.info('[Lazada OAuth] extracted token payload:', JSON.stringify(safePayload));
    }
  } catch (logError) {
    console.warn('[Lazada OAuth] failed to log Lazada token response', logError);
  }
}

function extractTokenPayload(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { tokens: null, raw: envelope };
  }

  if (envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)) {
    return { tokens: envelope.data, raw: envelope };
  }

  return { tokens: envelope, raw: envelope };
}

async function persistTokens({ supabase, siteId, payload, raw }) {
  if (!supabase) {
    const err = new Error('缺少 Supabase client，无法存储 Lazada 凭据');
    err.code = 'SUPABASE_CLIENT_MISSING';
    err.status = 500;
    throw err;
  }

  if (!siteId) {
    const err = new Error('授权 state 中缺少 siteId，无法存储 Lazada 凭据');
    err.code = 'SITE_ID_MISSING';
    err.status = 400;
    throw err;
  }

  if (!payload || typeof payload !== 'object') {
    const err = new Error('Lazada 授权响应缺失，无法存储凭据');
    err.code = 'LAZADA_TOKEN_RESPONSE_MISSING';
    err.status = 500;
    throw err;
  }

  const refreshToken = pickDeepString(payload, REFRESH_KEYS);
  if (!refreshToken) {
    console.error('[Lazada OAuth] Missing refresh token in payload', {
      keys: REFRESH_KEYS,
      snapshot: redactTokens(payload)
    });
    const err = new Error('Lazada 授权响应缺少 refresh_token，无法存储凭据');
    err.code = 'REFRESH_TOKEN_MISSING';
    err.status = 500;
    throw err;
  }

  const accessToken = pickDeepString(payload, ACCESS_KEYS);
  const expiresIn = pickDeepNumber(payload, EXPIRES_IN_KEYS);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const refreshExpiresIn = pickDeepNumber(payload, REFRESH_EXPIRES_IN_KEYS);

  const accountId =
    pickDeepString(payload, ACCOUNT_ID_KEYS) ||
    coerceString(payload?.country_user_info?.userId) ||
    coerceString(payload?.account_user_info?.userId) ||
    coerceString(Array.isArray(payload?.country_user_info) ? payload.country_user_info[0]?.userId : null) ||
    coerceString(Array.isArray(payload?.account_user_info) ? payload.account_user_info[0]?.userId : null);

  const country =
    pickDeepString(payload, COUNTRY_KEYS) ||
    coerceString(payload?.country_user_info?.country) ||
    coerceString(payload?.account_user_info?.country) ||
    coerceString(Array.isArray(payload?.country_user_info) ? payload.country_user_info[0]?.country : null) ||
    coerceString(Array.isArray(payload?.account_user_info) ? payload.account_user_info[0]?.country : null);

  const stateInfo =
    firstObjectMatch(payload, STATE_KEYS) ||
    payload?.country_user_info ||
    payload?.account_user_info ||
    null;

  return storeTokenRecord(supabase, {
    siteId,
    accessToken,
    refreshToken,
    expiresAt,
    meta: {
      account_id: accountId || null,
      country: country || null,
      refresh_expires_in: refreshExpiresIn || null,
      state: stateInfo || null,
      raw: raw && typeof raw === 'object' ? raw : undefined
    }
  });
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
    need_refresh_token: 'true',
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

function sanitizeReturnTo(value, host) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const hostOrigin = host ? `https://${host}` : null;
    const target = new URL(trimmed, hostOrigin || undefined);
    if (!host) {
      return target.pathname + target.search + target.hash;
    }
    if (target.host && target.host.toLowerCase() !== host.toLowerCase()) {
      return null;
    }
    return target.pathname + target.search + target.hash;
  } catch (error) {
    return null;
  }
}

function appendAuthResult(url, result) {
  if (!url) return null;
  const hasQuery = url.includes('?');
  const separator = hasQuery ? '&' : '?';
  return `${url}${separator}lazadaAuth=${encodeURIComponent(result)}`;
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
    const tokenEnvelope = await exchangeAuthorizationCode(code, redirectUri);
    const { tokens: tokenResponse, raw: rawTokenResponse } = extractTokenPayload(tokenEnvelope);

    logTokenResponse(tokenEnvelope, tokenResponse);

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

    const decodedState = decodeState(state);
    const supabase = createSupabaseClient();
    const siteId = decodedState?.siteId || decodedState?.site || null;
    const persistedRecord = await persistTokens({ supabase, siteId, payload: tokenResponse, raw: rawTokenResponse });

    const safeReturnTo = sanitizeReturnTo(decodedState?.returnTo, req.headers?.host);
    if (safeReturnTo) {
      const target = appendAuthResult(safeReturnTo, persistedRecord ? 'success' : 'stored=false');
      res.statusCode = 302;
      res.setHeader('Location', target);
      res.end();
      return;
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'Lazada authorization completed',
      data: {
        state: state || null,
        siteId: siteId || null,
        tokens: safeData,
        raw: rawTokenResponse,
        persisted: Boolean(persistedRecord)
      },
    });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    const body = {
      ok: false,
      success: false,
      error: err.message || 'Failed to exchange Lazada authorization code',
    };
    if (err.code) {
      body.code = err.code;
    }
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
module.exports.sanitizeReturnTo = sanitizeReturnTo;
