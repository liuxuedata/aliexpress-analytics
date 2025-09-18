const crypto = require('crypto');

function buildTraceId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const traceId = buildTraceId();

  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
      traceId
    });
  }

  const { code = null, state = null, error: errorCode = null, error_description: errorDescription = null } = req.query;

  const envState = {
    appKeyConfigured: Boolean(process.env.LAZADA_APP_KEY),
    appSecretConfigured: Boolean(process.env.LAZADA_APP_SECRET),
    redirectUriConfigured: Boolean(process.env.LAZADA_REDIRECT_URI),
    redirectUri: process.env.LAZADA_REDIRECT_URI || null
  };

  const ok = !errorCode && Boolean(code);
  const message = ok
    ? 'Lazada 授权回调已接收，请在服务端使用 code 换取访问令牌。'
    : 'Lazada 授权回调未包含有效的授权码，请检查错误信息。';

  const payload = {
    code,
    state,
    error: errorCode,
    errorDescription,
    env: envState
  };

  if (!envState.appKeyConfigured || !envState.appSecretConfigured || !envState.redirectUriConfigured) {
    console.warn('[lazada-oauth]', traceId, 'environment variables incomplete');
  }

  return res.status(ok ? 200 : 400).json({
    ok,
    message,
    traceId,
    data: payload
  });
}
