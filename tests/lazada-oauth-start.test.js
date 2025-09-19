const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../api/lazada/oauth/start');

function createSupabaseStub(site) {
  return {
    schema() { return this; },
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    limit() {
      return Promise.resolve({ data: site ? [site] : [], error: null });
    }
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function withEnv(env, fn) {
  const backup = {};
  for (const key of Object.keys(env)) {
    backup[key] = process.env[key];
    process.env[key] = env[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(env)) {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    }
  });
}

test('lazada oauth start returns authorize url', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseStub({
        id: 'lazada_site',
        platform: 'lazada',
        display_name: 'Lazada MY'
      }),
      stateFactory: () => 'signed-state'
    });

    const req = {
      method: 'GET',
      query: { siteId: 'lazada_site', returnTo: 'https://example.com/lazada.html' },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.data.url, /client_id=app-key/);
    assert.match(res.body.data.url, /state=signed-state/);
    assert.match(res.body.data.url, /redirect_uri=https%3A%2F%2Fexample.com%2Fcallback/);
  });
});

test('lazada oauth start rejects non lazada site', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseStub({
        id: 'amazon_site',
        platform: 'amazon',
        display_name: 'Amazon'
      }),
      stateFactory: () => 'signed-state'
    });

    const req = { method: 'GET', query: { siteId: 'amazon_site' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INVALID_PLATFORM');
  });
});

test('lazada oauth start returns 404 when site missing', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseStub(null),
      stateFactory: () => 'signed-state'
    });

    const req = { method: 'GET', query: { siteId: 'unknown' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, 'SITE_NOT_FOUND');
  });
});
