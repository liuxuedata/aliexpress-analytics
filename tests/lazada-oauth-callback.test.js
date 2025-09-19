const test = require('node:test');
const assert = require('node:assert/strict');

const moduleExport = require('../api/lazada/oauth/callback');
const handler = moduleExport.default || moduleExport;
const { createSignedState } = require('../lib/lazada-oauth-state');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
}

function snapshotEnv() {
  return {
    LAZADA_APP_KEY: process.env.LAZADA_APP_KEY,
    LAZADA_APP_SECRET: process.env.LAZADA_APP_SECRET,
    LAZADA_REDIRECT_URI: process.env.LAZADA_REDIRECT_URI,
  };
}

function restoreEnv(snapshot) {
  for (const key of Object.keys(snapshot)) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

test('lazada oauth callback requires authorization code', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';

  const req = { method: 'GET', query: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /authorization code/i);

  restoreEnv(originalEnv);
});

test('lazada oauth callback exchanges code for tokens', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';

  const fetchCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        refresh_expires_in: 86400,
        country_user_info: [{ country: 'SG' }],
      }),
    };
  };

  const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
  const req = {
    method: 'GET',
    query: { code: 'abc123', state },
    headers: { host: 'example.com' }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/lazada.html?lazadaAuth=stored%3Dfalse');
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /rest\/auth\/token\/create/);

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});
