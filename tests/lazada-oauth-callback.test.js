const test = require('node:test');
const assert = require('node:assert/strict');

const { createSignedState } = require('../lib/lazada-oauth-state');
const { buildLazadaSignature } = require('../api/lazada/oauth/callback');

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
      json: async () => ({
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
    assert.match(fetchCalls[0].url, /rest\/auth\/token\/create/);
    const url = new URL(fetchCalls[0].url);
    assert.equal(url.searchParams.get('need_refresh_token'), 'true');
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].site_id, 'lazada_site');
    assert.equal(upsertCalls[0].refresh_token, 'refresh');
  });

  if (originalFetch) {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
  restoreEnv(originalEnv);
});

test('lazada oauth callback skips empty refresh tokens in favor of nested value', async () => {
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
    json: async () => ({
      code: '0',
      data: {
        access_token: '',
        refresh_token: '',
        account_platform: 'lazada',
        nested: {
          refresh_token: 'refresh-nested',
          access_token: 'access-nested',
        },
      },
    }),
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
    const state = createSignedState({ siteId: 'site_nested', returnTo: '/lazada.html' }, { secret: 'secret' });
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
    assert.equal(upsertCalls[0].refresh_token, 'refresh-nested');
    assert.equal(upsertCalls[0].access_token, 'access-nested');
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
    json: async () => ({
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
    assert.equal(upsertCalls[0].meta.raw.request_id, 'req-123');
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
    json: async () => ({
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
test('buildLazadaSignature matches Lazada API name when hashing', () => {
  const params = {
    app_key: '123456',
    code: 'abc',
    redirect_uri: 'https://example.com/callback',
    sign_method: 'sha256',
    timestamp: '1700000000000',
    need_refresh_token: 'true',
  };

  const signature = buildLazadaSignature(params, 'secret');
  assert.equal(signature, 'BFF942DE94B87C6C9F147B160645681D1B81489C97BB98A3681A3033572E7B8C');
});

