const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAccessToken, storeTokenRecord } = require('../lib/lazada-auth');
const { createSupabaseMock } = require('./helpers/supabase-mock');

const ORIGINAL_ENV = { ...process.env };

test('ensureAccessToken returns cached token when not expired', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'lazada_site',
      provider: 'lazada',
      access_token: 'cached-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    }]
  });

  const tokens = await ensureAccessToken({
    supabase,
    siteId: 'lazada_site',
    fetchImpl: async () => { throw new Error('fetch should not be called'); }
  });

  assert.equal(tokens.accessToken, 'cached-token');
  assert.equal(tokens.refreshToken, 'refresh-token');
});

test('ensureAccessToken refreshes token when expired', async () => {
  process.env.LAZADA_APP_KEY = 'test-app';
  process.env.LAZADA_APP_SECRET = 'secret';

  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'lazada_site',
      provider: 'lazada',
      access_token: 'old-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() - 60 * 1000).toISOString()
    }]
  });

  let called = false;
  const fetchImpl = async (url) => {
    called = true;
    assert.ok(url.includes('auth.lazada.com'));
    return {
      ok: true,
      json: async () => ({
        access_token: 'new-token',
        refresh_token: 'refresh-token-2',
        expires_in: 3600
      })
    };
  };

  const tokens = await ensureAccessToken({
    supabase,
    siteId: 'lazada_site',
    fetchImpl
  });

  assert.equal(tokens.accessToken, 'new-token');
  assert.equal(tokens.refreshToken, 'refresh-token-2');
  assert.ok(called);

  const stored = supabase.state.integration_tokens[0];
  assert.equal(stored.access_token, 'new-token');
  assert.equal(stored.refresh_token, 'refresh-token-2');
});

test('storeTokenRecord validates required fields', async () => {
  const supabase = createSupabaseMock();
  await assert.rejects(storeTokenRecord(supabase, { siteId: null, refreshToken: 'foo' }));
  await assert.rejects(storeTokenRecord(supabase, { siteId: 'a', refreshToken: null }));
});

test.after(() => {
  process.env = { ...ORIGINAL_ENV };
});
