const { createClient } = require('@supabase/supabase-js');
const { loadTokenRecord, storeTokenRecord } = require('../../../../lib/lazada-auth');

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

async function refreshTokenWithOAuth2(refreshToken) {
  const clientId = getEnvOrThrow('LAZADA_APP_KEY');
  const clientSecret = getEnvOrThrow('LAZADA_APP_SECRET');
  const redirectUri = getEnvOrThrow('LAZADA_REDIRECT_URI');

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
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
    const error = new Error(message || 'Failed to refresh Lazada token');
    error.status = response.status;
    error.code = 'LAZADA_TOKEN_REFRESH_FAILED';
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

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const { siteId } = req.body || {};
    
    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: 'Missing siteId parameter',
        code: 'SITE_ID_MISSING'
      });
    }

    const supabase = createSupabaseClient();
    const tokenRecord = await loadTokenRecord(supabase, siteId);
    
    if (!tokenRecord || !tokenRecord.refresh_token) {
      return res.status(404).json({
        success: false,
        message: 'No refresh token found for this site',
        code: 'REFRESH_TOKEN_NOT_FOUND'
      });
    }

    const { payload, rawResponse } = await refreshTokenWithOAuth2(tokenRecord.refresh_token);
    
    if (!payload || !payload.refresh_token) {
      return res.status(500).json({
        success: false,
        message: 'Lazada OAuth response missing refresh_token',
        code: 'REFRESH_TOKEN_MISSING_IN_RESPONSE',
        details: {
          hasAccessToken: Boolean(payload?.access_token),
          hasRefreshToken: Boolean(payload?.refresh_token),
          expiresIn: payload?.expires_in,
          rawResponse: rawResponse ? rawResponse.substring(0, 500) : null
        }
      });
    }

    const expiresIn = Number(payload.expires_in);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const updatedRecord = await storeTokenRecord(supabase, {
      siteId,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt,
      meta: {
        ...tokenRecord.meta,
        last_refresh: new Date().toISOString(),
        refresh_expires_in: payload.refresh_expires_in,
        account_id: payload.account_id,
        country: payload.country,
        request_id: payload.request_id
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        siteId,
        accessToken: payload.access_token ? `${payload.access_token.substring(0, 10)}...` : null,
        refreshToken: payload.refresh_token ? `${payload.refresh_token.substring(0, 10)}...` : null,
        expiresAt,
        expiresIn: payload.expires_in,
        refreshExpiresIn: payload.refresh_expires_in,
        accountId: payload.account_id,
        country: payload.country,
        requestId: payload.request_id,
        updated: Boolean(updatedRecord)
      }
    });

  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    const response = {
      success: false,
      message: error.message || 'Failed to refresh token',
      timestamp: new Date().toISOString()
    };

    if (error.code) {
      response.code = error.code;
    }

    if (error.details) {
      response.details = error.details;
    }

    if (error.rawResponse) {
      response.rawResponse = error.rawResponse.substring(0, 500);
    }

    return res.status(status).json(response);
  }
}

module.exports = handler;
