const test = require('node:test');
const assert = require('node:assert/strict');
const { syncLazadaStats } = require('../lib/lazada-stats');
const { createSupabaseMock } = require('./helpers/supabase-mock');

test('syncLazadaStats stores daily and product metrics', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'lazada_site',
      provider: 'lazada',
      access_token: 'cached-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
    }],
    site_configs: [{ id: 'lazada_site', platform: 'lazada', config_json: {} }]
  });

  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    if (url.includes('/analytics/site/metrics')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { date: '2025-01-05', impressions: 100, visitors: 40, add_to_cart: 12, orders: 5, payments: 4, revenue: 320, currency: 'MYR' }
          ]
        })
      };
    }
    if (url.includes('/analytics/product/metrics')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { date: '2025-01-05', sku: 'SKU-1', name: 'Test Product', impressions: 20, visitors: 8, add_to_cart: 3, orders: 1, payments: 1, revenue: 80, currency: 'MYR' }
          ]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await syncLazadaStats({
    fetchImpl,
    supabase,
    siteId: 'lazada_site',
    from: '2025-01-01',
    to: '2025-01-07'
  });

  assert.equal(result.siteId, 'lazada_site');
  assert.equal(result.requestedSiteId, undefined);
  assert.equal(result.summary.siteId, 'lazada_site');
  assert.equal(result.daily.length, 1);
  assert.equal(result.products.length, 1);
  assert.equal(result.summary.revenue, 320);
  assert.deepEqual(result.availability.availableFields.sort(), ['add_to_cart', 'impressions', 'orders', 'payments', 'revenue', 'visitors']);
  assert.equal(supabase.state.site_metrics_daily.length, 1);
  assert.equal(supabase.state.product_metrics_daily.length, 1);
  assert.ok(fetchCalls.length >= 1);
});

test('syncLazadaStats normalizes alias site ids', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'lazada_flagship',
      provider: 'lazada',
      access_token: 'cached-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
    }],
    site_configs: [{ id: 'lazada_flagship', name: 'lazada_th', platform: 'lazada', config_json: {} }]
  });

  const fetchImpl = async (url) => {
    if (url.includes('/analytics/site/metrics')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { date: '2025-01-05', impressions: 200, visitors: 80, add_to_cart: 10, orders: 4, payments: 3, revenue: 120, currency: 'THB' }
          ]
        })
      };
    }
    if (url.includes('/analytics/product/metrics')) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { date: '2025-01-05', sku: 'SKU-TH', name: 'Thai Item', impressions: 20, visitors: 8, add_to_cart: 2, orders: 1, payments: 1, revenue: 40, currency: 'THB' }
          ]
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await syncLazadaStats({
    fetchImpl,
    supabase,
    siteId: 'lazada_th',
    from: '2025-01-01',
    to: '2025-01-07'
  });

  assert.equal(result.siteId, 'lazada_flagship');
  assert.equal(result.requestedSiteId, 'lazada_th');
  assert.equal(result.summary.siteId, 'lazada_flagship');
  assert.equal(supabase.state.site_metrics_daily[0].site, 'lazada_flagship');
  assert.equal(supabase.state.product_metrics_daily[0].site, 'lazada_flagship');
});

test('syncLazadaStats throws when site config missing', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'missing_site',
      provider: 'lazada',
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
    }]
  });

  await assert.rejects(
    syncLazadaStats({
      fetchImpl: async () => { throw new Error('should not call'); },
      supabase,
      siteId: 'missing_site'
    }),
    /未找到 Lazada 站点配置/
  );
});
