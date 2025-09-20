const { createClient } = require('@supabase/supabase-js');
const { ensureAccessToken } = require('../../../../lib/lazada-auth');
const { buildSignature } = require('../../../../lib/lazada-auth');

const LAZADA_ORDERS_ENDPOINT = 'https://api.lazada.com.my/rest/orders/get';
const LAZADA_ORDERS_PATH = '/orders/get';

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

async function callLazadaOrdersAPI(accessToken, siteId) {
  const appKey = getEnvOrThrow('LAZADA_APP_KEY');
  const appSecret = getEnvOrThrow('LAZADA_APP_SECRET');

  const timestamp = Date.now().toString();
  const params = {
    access_token: accessToken,
    app_key: appKey,
    sign_method: 'sha256',
    timestamp,
    limit: '1', // 只获取1条记录用于测试
    offset: '0'
  };

  // 构建签名
  params.sign = buildSignature(LAZADA_ORDERS_PATH, params, appSecret);

  const search = new URLSearchParams(params);
  const url = `${LAZADA_ORDERS_ENDPOINT}?${search.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
  } catch (networkError) {
    const message = networkError && typeof networkError.message === 'string'
      ? networkError.message
      : String(networkError);
    const error = new Error(`Failed to reach Lazada orders API: ${message}`);
    error.code = 'LAZADA_ORDERS_FETCH_FAILED';
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
    const error = new Error(message || 'Failed to call Lazada orders API');
    error.status = response.status;
    error.code = 'LAZADA_ORDERS_API_FAILED';
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
    rawResponse: rawBody,
    status: response.status
  };
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

  try {
    const { siteId } = req.query || {};
    
    if (!siteId) {
      return res.status(400).json({
        success: false,
        message: 'Missing siteId parameter',
        code: 'SITE_ID_MISSING'
      });
    }

    const supabase = createSupabaseClient();
    
    // 确保有有效的访问令牌
    const tokenInfo = await ensureAccessToken({
      supabase,
      siteId,
      fetchImpl: global.fetch || require('node-fetch')
    });

    if (!tokenInfo.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'No valid access token available',
        code: 'ACCESS_TOKEN_MISSING'
      });
    }

    // 调用 Lazada 订单 API
    const { payload, rawResponse, status } = await callLazadaOrdersAPI(tokenInfo.accessToken, siteId);

    // 检查响应码
    const code = payload?.code;
    const isSuccess = code === 0 || code === '0';

    if (!isSuccess) {
      return res.status(400).json({
        success: false,
        message: 'Lazada API returned error code',
        code: 'LAZADA_API_ERROR',
        details: {
          lazadaCode: code,
          lazadaMessage: payload?.message,
          requestId: payload?.request_id,
          status: status
        }
      });
    }

    // 成功响应
    const orders = payload?.data?.orders || [];
    const totalResults = payload?.data?.total_results || 0;

    return res.status(200).json({
      success: true,
      message: 'Lazada orders API test successful',
      data: {
        siteId,
        connected: true,
        lazadaCode: code,
        totalResults,
        ordersCount: orders.length,
        hasOrders: orders.length > 0,
        requestId: payload?.request_id,
        timestamp: new Date().toISOString()
      },
      // 包含脱敏的原始响应用于调试
      debug: {
        rawResponse: rawResponse ? rawResponse.substring(0, 1000) : null,
        payloadKeys: payload ? Object.keys(payload) : []
      }
    });

  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    const response = {
      success: false,
      message: error.message || 'Failed to test Lazada orders API',
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
