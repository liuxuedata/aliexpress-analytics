const DEFAULT_HOST = 'https://api.lazada.com/rest/';

const REGION_HOSTS = {
  sg: 'https://api.lazada.sg/rest/',
  my: 'https://api.lazada.com.my/rest/',
  id: 'https://api.lazada.co.id/rest/',
  th: 'https://api.lazada.co.th/rest/',
  vn: 'https://api.lazada.vn/rest/',
  ph: 'https://api.lazada.com.ph/rest/'
};

function normalizeHost(host) {
  if (!host) return DEFAULT_HOST;
  if (/^https?:\/\//i.test(host)) {
    return host.endsWith('/') ? host : `${host}/`;
  }
  return DEFAULT_HOST;
}

function resolveRegionFromDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const lower = domain.toLowerCase();
  if (lower.includes('.sg')) return 'sg';
  if (lower.includes('.com.my') || lower.endsWith('.my')) return 'my';
  if (lower.includes('.co.id')) return 'id';
  if (lower.includes('.co.th')) return 'th';
  if (lower.includes('.vn')) return 'vn';
  if (lower.includes('.com.ph')) return 'ph';
  return null;
}

function resolveApiHost(config) {
  if (!config) return DEFAULT_HOST;
  const apiHost = config?.config_json?.api_host || config?.config_json?.apiHost;
  if (apiHost) {
    return normalizeHost(apiHost);
  }

  const region = (config?.config_json?.region || config?.config_json?.country || config?.platform_region || resolveRegionFromDomain(config?.domain) || '').toLowerCase();
  if (region && REGION_HOSTS[region]) {
    return REGION_HOSTS[region];
  }
  return DEFAULT_HOST;
}

function buildUrl(host, path, params = {}) {
  const base = normalizeHost(host);
  const normalizedPath = path.startsWith('http') ? path : `${base}${path.replace(/^\//, '')}`;
  const url = new URL(normalizedPath);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  return url;
}

async function callLazadaApi({
  fetchImpl,
  accessToken,
  host,
  path,
  method = 'GET',
  params = {},
  body = null,
  headers = {}
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required to call Lazada API');
  }
  if (!accessToken) {
    throw new Error('Missing Lazada access token');
  }
  if (!path) {
    throw new Error('Missing Lazada API path');
  }

  const url = buildUrl(host, path, params);
  const requestHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...headers
  };

  const options = { method, headers: requestHeaders };
  if (method !== 'GET' && body !== null && body !== undefined) {
    if (typeof body === 'string' || body instanceof Buffer) {
      options.body = body;
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetchImpl(url.toString(), options);

  let rawText = '';
  let payload = null;

  if (typeof response.text === 'function') {
    rawText = await response.text();
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (err) {
      const error = new Error(`Lazada API 返回非 JSON：${rawText?.slice(0, 120) || 'empty response'}`);
      error.status = response.status;
      error.body = rawText;
      throw error;
    }
  } else if (typeof response.json === 'function') {
    payload = await response.json();
    rawText = payload ? JSON.stringify(payload) : '';
  } else {
    rawText = '';
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    const message = payload?.message || payload?.error_description || payload?.error || `Lazada API ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = payload;
    error.body = rawText;
    throw error;
  }

  return payload;
}

module.exports = {
  resolveApiHost,
  callLazadaApi,
  buildUrl,
  REGION_HOSTS,
  DEFAULT_HOST
};
