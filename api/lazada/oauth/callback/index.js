const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { storeTokenRecord } = require('../../../../lib/lazada-auth');
const { decodeState } = require('../../../../lib/lazada-oauth-state');
const { findKeyDeep } = require('../../../../lib/find-key-deep');

const TOKEN_ENDPOINT = 'https://auth.lazada.com/rest/auth/token/create';
const TOKEN_PATH = '/auth/token/create';

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

function pickDeepValue(payload, keys, options = {}) {
  if (!payload || typeof payload !== 'object') return null;

  const searchKeys = Array.isArray(keys) ? keys : [keys];
  const transformers = Array.isArray(options.transformers) && options.transformers.length > 0
    ? options.transformers
    : [
        (value) => {
          if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed ? trimmed : null;
          }
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          return null;
        },
      ];

  for (const key of searchKeys) {
    const match = findKeyDeep(payload, key, {
      maxDepth: options.maxDepth,
      predicate: ({ value, key: candidateKey, path, parent }) => {
        const context = { key: candidateKey, value, path, parent };
        for (const transform of transformers) {
          let result;
          try {
            result = transform(value, context);
          } catch (error) {
            continue;
          }
          if (result !== null && result !== undefined) {
            return { accept: true, value: result };
          }
        }
        return { accept: false };
      },
    });

    if (match) {
      return match.value;
    }
  }

  return null;
}

function extractTokenPayload(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { tokens: null, raw: envelope };
  }

  // 如果响应包含 data 字段，使用 data 字段
  if (envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)) {
    return { tokens: envelope.data, raw: envelope };
  }

  // 如果响应直接包含令牌字段，直接使用
  if (envelope.access_token || envelope.refresh_token) {
    return { tokens: envelope, raw: envelope };
  }

  // 默认返回整个响应
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

  // 详细调试令牌提取过程
  console.log('开始提取 refresh_token，payload 结构:', {
    payloadKeys: payload ? Object.keys(payload) : null,
    payloadType: typeof payload,
    payloadSample: payload ? JSON.stringify(payload).substring(0, 200) + '...' : null
  });

  const refreshToken = pickDeepValue(payload, ['refresh_token', 'refreshToken']);
  console.log('refresh_token 提取结果:', {
    refreshToken: refreshToken ? `${refreshToken.substring(0, 20)}...` : null,
    refreshTokenType: typeof refreshToken,
    refreshTokenLength: refreshToken ? refreshToken.length : 0
  });

  if (!refreshToken) {
    // 添加更详细的错误信息
    console.error('refresh_token 提取失败，payload 详情:', {
      payload: payload,
      payloadKeys: payload ? Object.keys(payload) : null,
      directAccess: {
        refresh_token: payload?.refresh_token,
        refreshToken: payload?.refreshToken
      }
    });
    
    const err = new Error('Lazada 授权响应缺少 refresh_token，无法存储凭据');
    err.code = 'REFRESH_TOKEN_MISSING';
    err.status = 500;
    throw err;
  }

  const accessToken = pickDeepValue(payload, ['access_token', 'accessToken']);
  const expiresIn = Number(payload.expires_in || payload.expire_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const countryInfo = Array.isArray(payload.country_user_info)
    ? payload.country_user_info[0]
    : payload.country_user_info;
  const accountInfo = Array.isArray(payload.account_user_info)
    ? payload.account_user_info[0]
    : payload.account_user_info;

  return storeTokenRecord(supabase, {
    siteId,
    accessToken,
    refreshToken,
    expiresAt,
    meta: {
      account_id:
        payload.account_id ||
        payload.accountId ||
        countryInfo?.user_id ||
        countryInfo?.userId ||
        accountInfo?.user_id ||
        accountInfo?.userId ||
        null,
      country:
        payload.country ||
        countryInfo?.country ||
        accountInfo?.country ||
        null,
      account: payload.account || null,
      seller_id:
        countryInfo?.seller_id ||
        countryInfo?.sellerId ||
        accountInfo?.seller_id ||
        accountInfo?.sellerId ||
        null,
      short_code:
        countryInfo?.short_code ||
        countryInfo?.shortCode ||
        accountInfo?.short_code ||
        accountInfo?.shortCode ||
        null,
      state: payload.country_user_info || payload.account_user_info || null,
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
  const body = search.toString();

  let response;
  try {
    response = await fetchLazada(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        Accept: 'application/json',
      },
      body,
    });
  } catch (networkError) {
    const message = networkError && typeof networkError.message === 'string'
      ? networkError.message
      : String(networkError);
    const error = new Error(`Failed to reach Lazada token endpoint: ${message}`);
    error.code = 'LAZADA_TOKEN_FETCH_FAILED';
    error.status = 502;
    error.cause = networkError;
    throw error;
  }

  let rawBody = null;
  try {
    rawBody = await response.text();
  } catch (readError) {
    rawBody = null;
  }

  let payload = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || rawBody || response.statusText;
    const error = new Error(message || 'Failed to exchange Lazada auth code');
    error.status = response.status;
    if (payload || rawBody) {
      error.details = payload || { raw: rawBody };
    }
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

    // 添加调试日志
    console.log('Lazada OAuth 回调调试信息:', {
      code: code ? `${code.substring(0, 10)}...` : null,
      state: state,
      redirectUri: redirectUri,
      tokenEnvelopeKeys: tokenEnvelope ? Object.keys(tokenEnvelope) : null,
      tokenResponseKeys: tokenResponse ? Object.keys(tokenResponse) : null,
      hasAccessToken: Boolean(tokenResponse?.access_token),
      hasRefreshToken: Boolean(tokenResponse?.refresh_token),
      timestamp: new Date().toISOString()
    });

  const safeData = tokenResponse && typeof tokenResponse === 'object'
    ? {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in,
        refresh_expires_in: tokenResponse.refresh_expires_in,
        account_platform: tokenResponse.account_platform,
        account_id: tokenResponse.account_id || tokenResponse.accountId || null,
        country: tokenResponse.country || null,
        account: tokenResponse.account || null,
        code: tokenResponse.code || null,
        request_id: tokenResponse.request_id || tokenResponse.requestId || null,
        country_user_info: tokenResponse.country_user_info,
        account_user_info: tokenResponse.account_user_info,
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
