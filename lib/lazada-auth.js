const crypto = require('crypto');
const { coerceDate } = require('./lazada-utils');

const TOKEN_REFRESH_ENDPOINT = 'https://auth.lazada.com/rest/auth/token/refresh';
const TOKEN_REFRESH_PATH = '/rest/auth/token/refresh';
const PROVIDER = 'lazada';
const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

function getEnvOrThrow(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

function buildSignature(path, params, secret) {
  const sortedKeys = Object.keys(params).sort();
  let base = path;
  for (const key of sortedKeys) {
    base += key + params[key];
  }
  return crypto.createHmac('sha256', secret).update(base).digest('hex').toUpperCase();
}

async function refreshAccessToken(fetchImpl, refreshToken) {
  const appKey = getEnvOrThrow('LAZADA_APP_KEY');
  const appSecret = getEnvOrThrow('LAZADA_APP_SECRET');

  if (!refreshToken) {
    throw new Error('Missing Lazada refresh token');
  }

  const timestamp = Date.now().toString();
  const params = {
    app_key: appKey,
    refresh_token: refreshToken,
    sign_method: 'sha256',
    timestamp
  };

  params.sign = buildSignature(TOKEN_REFRESH_PATH, params, appSecret);

  const search = new URLSearchParams(params);
  const response = await fetchImpl(`${TOKEN_REFRESH_ENDPOINT}?${search.toString()}`, {
    method: 'POST'
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || 'Failed to refresh Lazada token';
    const error = new Error(message);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  const expiresIn = Number(payload?.expires_in || payload?.expire_in);
  const now = Date.now();
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(now + expiresIn * 1000).toISOString()
    : null;

  return {
    accessToken: payload?.access_token || null,
    refreshToken: payload?.refresh_token || refreshToken,
    expiresAt,
    raw: payload
  };
}

async function loadTokenRecord(supabase, siteId, provider = PROVIDER) {
  const { data, error } = await supabase
    .schema('public')
    .from('integration_tokens')
    .select('*')
    .eq('site_id', siteId)
    .eq('provider', provider)
    .limit(1);

  if (error) {
    throw new Error(`Supabase 查询 Lazada 凭据失败：${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function storeTokenRecord(supabase, {
  siteId,
  provider = PROVIDER,
  accessToken,
  refreshToken,
  expiresAt,
  scope,
  meta
}) {
  if (!siteId) {
    throw new Error('siteId is required when storing Lazada tokens');
  }
  if (!refreshToken) {
    throw new Error('refreshToken is required when storing Lazada tokens');
  }

  const row = {
    site_id: siteId,
    provider,
    access_token: accessToken || null,
    refresh_token: refreshToken,
    expires_at: expiresAt ? coerceDate(expiresAt) : null,
    scope: Array.isArray(scope) ? scope : null,
    meta: meta && typeof meta === 'object' ? meta : {}
  };

  const { data, error } = await supabase
    .schema('public')
    .from('integration_tokens')
    .upsert(row, { onConflict: 'site_id,provider' })
    .select();

  if (error) {
    throw new Error(`Supabase 写入 Lazada 凭据失败：${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : row;
}

function isTokenValid(record) {
  if (!record?.access_token) return false;
  if (!record?.expires_at) return true;
  const expires = new Date(record.expires_at).getTime();
  if (Number.isNaN(expires)) return false;
  return expires - CLOCK_SKEW_MS > Date.now();
}

async function ensureAccessToken({
  supabase,
  siteId,
  fetchImpl = global.fetch || require('node-fetch'),
  forceRefresh = false
}) {
  if (!supabase) {
    throw new Error('Supabase client is required to load Lazada tokens');
  }
  if (!siteId) {
    throw new Error('siteId is required to load Lazada tokens');
  }

  const record = await loadTokenRecord(supabase, siteId);
  if (!record || !record.refresh_token) {
    const err = new Error('未找到 Lazada 刷新令牌，请重新授权站点。');
    err.code = 'TOKEN_NOT_FOUND';
    throw err;
  }

  if (!forceRefresh && isTokenValid(record)) {
    return {
      accessToken: record.access_token,
      expiresAt: record.expires_at ? new Date(record.expires_at).toISOString() : null,
      refreshToken: record.refresh_token
    };
  }

  const tokens = await refreshAccessToken(fetchImpl, record.refresh_token);
  await storeTokenRecord(supabase, {
    siteId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    meta: tokens.raw || {}
  });

  return {
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    refreshToken: tokens.refreshToken
  };
}

module.exports = {
  refreshAccessToken,
  loadTokenRecord,
  storeTokenRecord,
  ensureAccessToken,
  buildSignature,
  TOKEN_REFRESH_ENDPOINT,
  TOKEN_REFRESH_PATH,
  PROVIDER
};
