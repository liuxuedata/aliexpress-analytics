const { randomUUID } = require('crypto');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    const traceId = randomUUID();
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
      traceId
    });
  }

  const traceId = randomUUID();
  const { code, state, error, error_description: errorDescription } = req.query || {};

  if (error || errorDescription) {
    return res.status(400).json({
      ok: false,
      error: errorDescription || error || 'Authorization failed',
      traceId,
      data: {
        state: state || null
      }
    });
  }

  if (!code) {
    return res.status(400).json({
      ok: false,
      error: 'Missing authorization code',
      traceId,
      data: {
        state: state || null
      }
    });
  }

  const redirectUri = process.env.LAZADA_REDIRECT_URI || 'https://aliexpress-analytics.vercel.app/api/lazada/oauth/callback';

  return res.status(200).json({
    ok: true,
    message: 'Lazada authorization callback received. Use the returned code to exchange for an access token.',
    traceId,
    data: {
      code,
      state: state || null,
      redirectUri
    }
  });
}
