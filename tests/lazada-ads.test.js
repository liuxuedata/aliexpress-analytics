const test = require('node:test');
const assert = require('node:assert/strict');
const { syncLazadaAds } = require('../lib/lazada-ads');
const { createSupabaseMock } = require('./helpers/supabase-mock');

test('syncLazadaAds upserts campaigns and metrics', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'lazada_site',
      provider: 'lazada',
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
    }],
    site_configs: [{ id: 'lazada_site', platform: 'lazada', config_json: {} }]
  });

  const fetchImpl = async (url) => {
    if (url.includes('/marketing/campaign/list')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            campaigns: [
              { campaign_id: 'cmp1', campaign_name: 'Brand Campaign', status: 'active', daily_budget: 50, total_budget: 500 }
            ]
          }
        })
      };
    }
    if (url.includes('/marketing/campaign/metrics')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            records: [
              { campaign_id: 'cmp1', date: '2025-01-05', impressions: 1000, clicks: 120, spend: 80, conversions: 6, conversion_value: 300, roas: 3.75 }
            ]
          }
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const { campaigns } = await syncLazadaAds({
    fetchImpl,
    supabase,
    siteId: 'lazada_site',
    from: '2025-01-01',
    to: '2025-01-07'
  });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].metrics.length, 1);
  assert.equal(supabase.state.ad_campaigns.length, 1);
  assert.equal(supabase.state.ad_metrics_daily.length, 1);
});

test('syncLazadaAds requires site configuration', async () => {
  const supabase = createSupabaseMock({
    integration_tokens: [{
      site_id: 'missing',
      provider: 'lazada',
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString()
    }]
  });

  await assert.rejects(
    syncLazadaAds({
      fetchImpl: async () => { throw new Error('should not run'); },
      supabase,
      siteId: 'missing'
    }),
    /未找到 Lazada 站点配置/
  );
});
