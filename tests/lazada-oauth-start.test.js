const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../api/lazada/oauth/start');
const { createSupabaseMock } = require('./helpers/supabase-mock');

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
      clientFactory: () => createSupabaseMock({
        site_configs: [{
          id: 'lazada_site',
          platform: 'lazada',
          display_name: 'Lazada MY',
          name: 'lazada_my',
          config_json: { seller_short_code: 'SELLER123' }
        }]
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
    assert.match(res.body.data.url, /seller_short_code=SELLER123/);
    assert.equal(res.body.data.seller_short_code, 'SELLER123');
  });
});

test('lazada oauth start prefers seller short code from query', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseMock({
        site_configs: [{
          id: 'lazada_site',
          platform: 'lazada',
          display_name: 'Lazada MY',
          name: 'lazada_my',
          config_json: { seller_short_code: 'CONFIG123' }
        }]
      }),
      stateFactory: () => 'signed-state'
    });

    const req = {
      method: 'GET',
      query: { siteId: 'lazada_site', sellerShortCode: 'QUERY456' },
      headers: { host: 'example.com' }
    };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.data.url, /seller_short_code=QUERY456/);
    assert.equal(res.body.data.seller_short_code, 'QUERY456');
  });
});

test('lazada oauth start normalizes alias site id', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseMock({
        site_configs: [{
          id: 'lazada_flagship',
          name: 'lazada_th',
          platform: 'lazada',
          display_name: 'Lazada TH',
          config_json: { seller_short_code: 'TH123' }
        }]
      }),
      stateFactory: () => 'signed-state'
    });

    const req = { method: 'GET', query: { siteId: 'lazada_th' }, headers: { host: 'example.com' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.site.id, 'lazada_flagship');
    assert.equal(res.body.data.requestedSiteId, 'lazada_th');
    assert.equal(res.body.data.seller_short_code, 'TH123');
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
      clientFactory: () => createSupabaseMock({
        site_configs: [{
          id: 'amazon_site',
          platform: 'amazon',
          display_name: 'Amazon',
          name: 'amazon_site',
          config_json: {}
        }]
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
      clientFactory: () => createSupabaseMock({ site_configs: [] }),
      stateFactory: () => 'signed-state'
    });

    const req = { method: 'GET', query: { siteId: 'unknown' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, 'SITE_NOT_FOUND');
  });
});

test('lazada oauth start fails when seller short code missing', async () => {
  await withEnv({
    LAZADA_APP_KEY: 'app-key',
    LAZADA_REDIRECT_URI: 'https://example.com/callback',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service'
  }, async () => {
    const handler = createHandler({
      clientFactory: () => createSupabaseMock({
        site_configs: [{
          id: 'lazada_site',
          platform: 'lazada',
          display_name: 'Lazada MY',
          name: 'lazada_my',
          config_json: {}
        }]
      }),
      stateFactory: () => 'signed-state'
    });

    const req = { method: 'GET', query: { siteId: 'lazada_site' } };
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'SELLER_SHORT_CODE_REQUIRED');
    assert.equal(res.body.success, false);
  });
});
