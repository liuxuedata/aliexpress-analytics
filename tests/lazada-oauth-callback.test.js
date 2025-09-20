const test = require('node:test');
const assert = require('node:assert/strict');

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

function loadHandler() {
  delete require.cache[require.resolve('../api/lazada/oauth/callback')];
  const moduleExport = require('../api/lazada/oauth/callback');
  return moduleExport.default || moduleExport;
}

async function withSupabaseClientStub(createClientImpl, run) {
  const modulePath = require.resolve('@supabase/supabase-js');
  const originalEntry = require.cache[modulePath];
  delete require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: { createClient: createClientImpl },
  };

  try {
    await run();
  } finally {
    delete require.cache[modulePath];
    if (originalEntry) {
      require.cache[modulePath] = originalEntry;
    }
  }
}

function snapshotEnv() {
  return {
    LAZADA_APP_KEY: process.env.LAZADA_APP_KEY,
    LAZADA_APP_SECRET: process.env.LAZADA_APP_SECRET,
    LAZADA_REDIRECT_URI: process.env.LAZADA_REDIRECT_URI,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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

  const handler = loadHandler();
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
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const fetchCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        refresh_expires_in: 86400,
        country_user_info: [{ country: 'SG' }],
      }),
    };
  };

  const upsertCalls = [];
  await withSupabaseClientStub(() => ({
    schema() {
      return {
        from() {
          return {
            upsert(row) {
              upsertCalls.push(row);
              return {
                select: async () => ({ data: [{ id: 'record', ...row }], error: null })
              };
            }
          };
        }
      };
    }
  }), async () => {
    const handler = loadHandler();
    const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
    const req = {
      method: 'GET',
      query: { code: 'abc123', state },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, '/lazada.html?lazadaAuth=success');
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://auth.lazada.com/rest/auth/token/create');
    const { headers, body } = fetchCalls[0].options;
    assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
    const params = new URLSearchParams(body);
    assert.equal(params.get('need_refresh_token'), 'true');
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('client_id'), 'key');
    assert.equal(params.get('client_secret'), 'secret');
    assert.equal(params.get('app_secret'), 'secret');
    assert.ok(params.get('sign'));
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].site_id, 'lazada_site');
    assert.equal(upsertCalls[0].refresh_token, 'refresh');
    assert.equal(upsertCalls[0].access_token, 'access');
    assert.equal(upsertCalls[0].meta.refresh_expires_in, 86400);
    assert.equal(upsertCalls[0].meta.country, 'SG');
    assert.deepEqual(upsertCalls[0].meta.state, [{ country: 'SG' }]);
    assert.equal(upsertCalls[0].meta.seller_map, null);
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});

test('lazada oauth callback handles responses wrapped in data envelope', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      code: '0',
      data: {
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 1800,
        account_id: 'seller-1'
      },
      request_id: 'req-123'
    })
  });

  const upsertCalls = [];
  await withSupabaseClientStub(() => ({
    schema() {
      return {
        from() {
          return {
            upsert(row) {
              upsertCalls.push(row);
              return {
                select: async () => ({ data: [{ id: 'record', ...row }], error: null })
              };
            }
          };
        }
      };
    }
  }), async () => {
    const handler = loadHandler();
    const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
    const req = {
      method: 'GET',
      query: { code: 'abc123', state },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, '/lazada.html?lazadaAuth=success');
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].refresh_token, 'refresh');
    assert.equal(upsertCalls[0].meta.account_id, 'seller-1');
    assert.equal(upsertCalls[0].meta.refresh_expires_in, null);
    assert.equal(upsertCalls[0].meta.country, null);
    assert.equal(upsertCalls[0].meta.state, null);
    assert.equal(upsertCalls[0].meta.raw.request_id, 'req-123');
    assert.equal(upsertCalls[0].meta.seller_map, null);
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});

test('lazada oauth callback finds tokens nested inside Lazada wrapper objects', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      data: {
        token_result: [
          {
            token_info: {
              tokens: {
                refreshToken: '  nested-refresh  ',
                accessToken: ' nested-access ',
              },
              metrics: {
                expiresIn: ' 3600 ',
                refreshExpiresIn: '172800',
              },
              profile: {
                sellerId: 'seller-2',
                region: 'PH',
              }
            }
          }
        ]
      }
    })
  });

  const upsertCalls = [];
  await withSupabaseClientStub(() => ({
    schema() {
      return {
        from() {
          return {
            upsert(row) {
              upsertCalls.push(row);
              return {
                select: async () => ({ data: [{ id: 'record', ...row }], error: null })
              };
            }
          };
        }
      };
    }
  }), async () => {
    const handler = loadHandler();
    const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
    const req = {
      method: 'GET',
      query: { code: 'abc123', state },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, '/lazada.html?lazadaAuth=success');
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].refresh_token, 'nested-refresh');
    assert.equal(upsertCalls[0].access_token, 'nested-access');
    assert.equal(upsertCalls[0].meta.account_id, 'seller-2');
    assert.equal(upsertCalls[0].meta.country, 'PH');
    assert.equal(upsertCalls[0].meta.refresh_expires_in, 172800);
    assert.equal(upsertCalls[0].meta.state, null);
    assert.equal(upsertCalls[0].meta.seller_map, null);
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});

test('lazada oauth callback parses JSON string token payloads', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      code: '0',
      data: JSON.stringify({
        token_info: {
          refresh_token: '  string-refresh  ',
          access_token: ' string-access ',
          expires_in: ' 900 ',
          refresh_expires_in: ' 3600 ',
          country_user_info: [
            {
              country: 'VN',
              seller_id: 'seller-99',
              user_id: 8888,
            }
          ]
        }
      }),
      request_id: 'req-json'
    })
  });

  const upsertCalls = [];
  await withSupabaseClientStub(() => ({
    schema() {
      return {
        from() {
          return {
            upsert(row) {
              upsertCalls.push(row);
              return {
                select: async () => ({ data: [{ id: 'record', ...row }], error: null })
              };
            }
          };
        }
      };
    }
  }), async () => {
    const handler = loadHandler();
    const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
    const req = {
      method: 'GET',
      query: { code: 'abc123', state },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.Location, '/lazada.html?lazadaAuth=success');
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].refresh_token, 'string-refresh');
    assert.equal(upsertCalls[0].access_token, 'string-access');
    assert.equal(upsertCalls[0].meta.country, 'VN');
    assert.equal(upsertCalls[0].meta.account_id, 'seller-99');
    assert.equal(upsertCalls[0].meta.refresh_expires_in, 3600);
    assert.ok(Array.isArray(upsertCalls[0].meta.state));
    assert.equal(upsertCalls[0].meta.state[0].country, 'VN');
    assert.equal(upsertCalls[0].meta.raw.request_id, 'req-json');
    assert.equal(typeof upsertCalls[0].meta.raw.data, 'string');
    assert.deepEqual(upsertCalls[0].meta.seller_map, { VN: 'seller-99' });
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});

test('lazada oauth callback reports Supabase credential misconfiguration', async () => {
  const originalEnv = snapshotEnv();
  process.env.LAZADA_APP_KEY = 'key';
  process.env.LAZADA_APP_SECRET = 'secret';
  process.env.LAZADA_REDIRECT_URI = 'https://example.com/callback';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
    })
  });

  const state = createSignedState({ siteId: 'lazada_site', returnTo: '/lazada.html' }, { secret: 'secret' });
  const req = {
    method: 'GET',
    query: { code: 'abc123', state },
    headers: { host: 'example.com' }
  };
  const handler = loadHandler();
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, 'SUPABASE_SERVICE_ROLE_KEY_MISSING');
  assert.match(res.body.error, /SUPABASE_SERVICE_ROLE_KEY/);

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});
