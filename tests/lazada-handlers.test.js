const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler: createStatsHandler } = require('../api/lazada/stats/index.js');
const { createHandler: createOrdersHandler } = require('../api/lazada/orders/index.js');
const { createHandler: createAdsHandler } = require('../api/lazada/ads/index.js');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
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

test('lazada stats handler returns payload', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const handler = createStatsHandler({
    clientFactory: () => ({
      schema() {
        return {
          from() {
            return {
              select() { return Promise.resolve({ data: [{ id: 'site', platform: 'lazada', config_json: {} }], error: null }); }
            };
          }
        };
      }
    }),
    fetchImpl: async () => { throw new Error('fetch should not be called'); },
    syncStats: async () => ({
      daily: [],
      products: [],
      summary: { impressions: 0, visitors: 0, add_to_cart: 0, orders: 0, payments: 0, revenue: 0, currency: 'CNY', days: 0 },
      availability: { availableFields: [], missingFields: [] }
    })
  });

  const res = createResponse();
  await handler({ method: 'GET', query: { siteId: 'lazada_site' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.daily));
});

test('lazada orders handler rejects non GET', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const handler = createOrdersHandler({ syncOrders: async () => ({ orders: [], summary: {} }) });
  const res = createResponse();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});

test('lazada ads handler returns campaigns', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

  const handler = createAdsHandler({
    clientFactory: () => ({
      schema() {
        return {
          from() {
            return {
              select() { return Promise.resolve({ data: [{ id: 'site', platform: 'lazada', config_json: {} }], error: null }); }
            };
          }
        };
      }
    }),
    syncAds: async () => ({ campaigns: [] })
  });

  const res = createResponse();
  await handler({ method: 'GET', query: { siteId: 'lazada_site' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.data.campaigns));
});
