const { createClient } = require('@supabase/supabase-js');
const { storeTokenRecord } = require('../../../../lib/lazada-auth');
const { decodeState } = require('../../../../lib/lazada-oauth-state');
const { findKeyDeep } = require('../../../../lib/find-key-deep');

const OAUTH_TOKEN_ENDPOINT = 'https://auth.lazada.com/oauth/token';

function getEnvOrThrow(key, hint) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured${hint ? ` (${hint})` : ''}`);
  }
  return value;
}

function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    const err = new Error('SUPABASE_URL is not configured');
    err.code = 'SUPABASE_URL_MISSING';
    err.status = 500;
    throw err;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
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

async function exchangeAuthorizationCodeWithOAuth2(code, redirectUri) {
  const clientId = getEnvOrThrow('LAZADA_APP_KEY');
  const clientSecret = getEnvOrThrow('LAZADA_APP_SECRET');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri
  });

  let response;
  try {
    response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
  } catch (networkError) {
    const message = networkError && typeof networkError.message === 'string'
      ? networkError.message
      : String(networkError);
    const error = new Error(`Failed to reach Lazada OAuth token endpoint: ${message}`);
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
    const message = payload?.error_description || payload?.error || rawBody || response.statusText;
    const error = new Error(message || 'Failed to exchange Lazada auth code');
    error.status = response.status;
    error.code = 'LAZADA_TOKEN_EXCHANGE_FAILED';
    if (payload) {
      error.details = payload;
    }
    if (rawBody) {
      error.rawResponse = rawBody;
    }
    throw error;
  }

  return {
    payload,
    rawResponse: rawBody
  };
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
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const { code, state, error, error_description: errorDescription } = req.query || {};

  if (error) {
    return res.status(400).json({
      success: false,
      error,
      message: errorDescription || 'Lazada authorization failed',
      state: state || null,
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Missing authorization code'
    });
  }

  try {
    const redirectUri = getEnvOrThrow('LAZADA_REDIRECT_URI', 'must match Lazada app settings');
    const { payload, rawResponse } = await exchangeAuthorizationCodeWithOAuth2(code, redirectUri);

    // 使用 findKeyDeep 深度搜索 refresh_token
    const refreshToken = pickDeepValue(payload, ['refresh_token', 'refreshToken']);
    const accessToken = pickDeepValue(payload, ['access_token', 'accessToken']);
    
    if (!refreshToken) {
      return res.status(500).json({
        success: false,
        message: 'Lazada OAuth response missing refresh_token',
        code: 'REFRESH_TOKEN_MISSING',
        details: {
          hasAccessToken: Boolean(accessToken),
          hasRefreshToken: Boolean(refreshToken),
          expiresIn: payload?.expires_in,
          rawResponse: rawResponse ? rawResponse.substring(0, 500) : null,
          payloadKeys: payload ? Object.keys(payload) : []
        }
      });
    }

    const expiresIn = Number(payload.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const decodedState = decodeState(state);
    const supabase = createSupabaseClient();
    const siteId = decodedState?.siteId || decodedState?.site || null;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid state parameter - missing siteId',
        code: 'SITE_ID_MISSING'
      });
    }

    const persistedRecord = await storeTokenRecord(supabase, {
      siteId,
      accessToken,
      refreshToken,
      expiresAt,
      meta: {
        account_id: payload.account_id,
        country: payload.country,
        request_id: payload.request_id,
        account_platform: payload.account_platform,
        refresh_expires_in: payload.refresh_expires_in,
        country_user_info: payload.country_user_info,
        account_user_info: payload.account_user_info,
        raw: payload
      }
    });

    const safeReturnTo = sanitizeReturnTo(decodedState?.returnTo, req.headers?.host);
    if (safeReturnTo) {
      const target = appendAuthResult(safeReturnTo, persistedRecord ? 'success' : 'stored=false');
      res.statusCode = 302;
      res.setHeader('Location', target);
      res.end();
      return;
    }

    return res.status(200).json({
      success: true,
      message: 'Lazada OAuth2 authorization completed',
      data: {
        state: state || null,
        siteId: siteId || null,
        tokens: {
          access_token: accessToken ? `${accessToken.substring(0, 10)}...` : null,
          refresh_token: refreshToken ? `${refreshToken.substring(0, 10)}...` : null,
          expires_in: payload.expires_in,
          refresh_expires_in: payload.refresh_expires_in,
          account_id: payload.account_id,
          country: payload.country,
          request_id: payload.request_id,
          account_platform: payload.account_platform
        },
        persisted: Boolean(persistedRecord)
      },
    });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    const body = {
      success: false,
      message: err.message || 'Failed to exchange Lazada authorization code',
      timestamp: new Date().toISOString()
    };
    
    if (err.code) {
      body.code = err.code;
    }
    
    if (err.details) {
      body.details = err.details;
    }
    
    if (err.rawResponse) {
      body.rawResponse = err.rawResponse.substring(0, 500);
    }
    
    return res.status(status).json(body);
  }
}

module.exports = handler;
