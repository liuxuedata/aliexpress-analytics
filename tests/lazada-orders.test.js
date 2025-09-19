const test = require('node:test');
const assert = require('node:assert/strict');
const { syncLazadaOrders } = require('../lib/lazada-orders');
const { createSupabaseMock } = require('./helpers/supabase-mock');

test('syncLazadaOrders fetches and persists orders', async () => {
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
    if (url.includes('/orders/get')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            orders: [
              {
                order_id: '123',
                order_number: '123',
                created_at: '2025-01-05T10:00:00Z',
                order_status: 'shipped',
                payment_status: 'paid',
                currency: 'MYR',
                shipping_fee: 12,
                voucher: 2,
                tax_amount: 1,
                total_amount: 150,
                items: [
                  { order_item_id: 'A', sku: 'SKU-1', product_name: 'Item 1', quantity: 2, item_price: 50, paid_price: 100, cost_price: 40, product_image: 'https://img.example/item1.jpg' }
                ]
              }
            ],
            count: 1
          }
        })
      };
    }
    if (url.includes('/order/items/get')) {
      return {
        ok: true,
        json: async () => ({ data: [] })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const { orders, summary } = await syncLazadaOrders({
    fetchImpl,
    supabase,
    siteId: 'lazada_site',
    from: '2025-01-01',
    to: '2025-01-10'
  });

  assert.equal(orders.length, 1);
  assert.equal(orders[0].order_no, '123');
  assert.equal(orders[0].order_items.length, 1);
  assert.equal(summary.fetched, 1);
  assert.equal(summary.persisted, 1);
  assert.ok(summary.tokenRefreshed === false || typeof summary.tokenRefreshed === 'boolean');
  assert.equal(supabase.state.orders.length, 1);
  assert.equal(supabase.state.order_items.length, 1);
});

test('syncLazadaOrders throws for missing site config', async () => {
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
    syncLazadaOrders({
      fetchImpl: async () => { throw new Error('should not reach'); },
      supabase,
      siteId: 'missing'
    }),
    /未找到 Lazada 站点配置/
  );
});
