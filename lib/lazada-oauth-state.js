const crypto = require('crypto');

function getStateSecret(explicitSecret) {
  if (explicitSecret !== undefined) {
    return explicitSecret || '';
  }
  return process.env.LAZADA_STATE_SECRET
    || process.env.LAZADA_APP_SECRET
    || '';
}

function toBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function fromBase64(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function ensurePayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function createSignedState(payload, options = {}) {
  const { secret } = options;
  const data = ensurePayload(payload);
  if (!data.siteId) {
    throw new Error('siteId is required when creating Lazada state');
  }

  if (!data.nonce) {
    data.nonce = crypto.randomBytes(8).toString('hex');
  }
  if (!data.ts) {
    data.ts = Date.now();
  }

  const raw = JSON.stringify(data);
  const stateSecret = getStateSecret(secret);
  const envelope = { payload: raw };

  if (stateSecret) {
    envelope.sig = crypto.createHmac('sha256', stateSecret).update(raw).digest('hex');
  }

  return toBase64(JSON.stringify(envelope));
}

function interpretObject(value, secret) {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.trim()) {
      return { siteId: value.trim() };
    }
    return {};
  }

  if (value.payload) {
    const rawPayload = typeof value.payload === 'string'
      ? value.payload
      : JSON.stringify(value.payload);

    const stateSecret = getStateSecret(secret);
    if (stateSecret && value.sig) {
      const expected = crypto.createHmac('sha256', stateSecret).update(rawPayload).digest('hex');
      if (expected !== value.sig) {
        return {};
      }
    }

    const nested = safeJsonParse(rawPayload);
    if (nested) {
      return interpretObject(nested, secret);
    }
  }

  const candidate = { ...value };
  if (!candidate.siteId && (candidate.site || candidate.site_id)) {
    candidate.siteId = candidate.site || candidate.site_id;
  }
  return candidate;
}

function parseStateString(state) {
  const trimmed = state.trim();
  if (!trimmed) return {};

  const directJson = safeJsonParse(decodeURIComponent(trimmed));
  if (directJson) return directJson;

  const base64Json = safeJsonParse(fromBase64(trimmed));
  if (base64Json) return base64Json;

  const params = new URLSearchParams(trimmed);
  if (params.has('siteId') || params.has('site')) {
    return {
      siteId: params.get('siteId') || params.get('site'),
      state: trimmed
    };
  }

  return { siteId: trimmed };
}

function decodeState(state, options = {}) {
  if (!state) return {};

  const { secret } = options;
  if (typeof state === 'string') {
    const parsed = parseStateString(state);
    return interpretObject(parsed, secret);
  }

  return interpretObject(state, secret);
}

module.exports = {
  createSignedState,
  decodeState,
  _private: { getStateSecret, parseStateString, interpretObject }
};
