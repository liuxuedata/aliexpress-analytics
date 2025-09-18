const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRange,
  mapPostingToOrder,
  aggregatePostings,
  parseOzonResponse,
  extractJsonSegment,
  syncOzonOrders
} = require('../lib/ozon-orders');

function createSupabaseStub({ sites = ['ozon_main'], siteConfigs = [] } = {}) {
  const state = {
    upserts: [],
    deleted: [],
    insertedItems: [],
    queryData: [],
    siteQueries: [],
    configQueries: [],
    sites: new Set(sites),
    siteUpserts: [],
    siteConfigs: new Map(
      (siteConfigs || [])
        .filter(cfg => cfg && cfg.id)
        .map(cfg => [cfg.id, { ...cfg }])
    )
  };

  const builder = {
    eq() { return this; },
    order() { return this; },
    gte() { return this; },
    lte() { return this; },
    limit() { return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: state.queryData, error: null }).then(resolve, reject);
    }
  };

  return {
    state,
    schema() {
      return {
        from(table) {
          if (table === 'orders') {
            return {
              upsert(rows) {
                state.upserts.push(...rows);
                return {
                  select() {
                    const data = rows.map((row, index) => ({ ...row, id: `order-${index}` }));
                    return Promise.resolve({ data, error: null });
                  }
                };
              },
              select() {
                return builder;
              },
              eq: builder.eq,
              order: builder.order,
              gte: builder.gte,
              lte: builder.lte,
              limit: builder.limit
            };
          }

          if (table === 'order_items') {
            return {
              delete() {
                return {
                  in(_, ids) {
                    state.deleted.push(...ids);
                    return Promise.resolve({ error: null });
                  }
                };
              },
              insert(rows) {
                state.insertedItems.push(...rows);
                return Promise.resolve({ error: null });
              }
            };
          }

          if (table === 'sites') {
            return {
              select() {
                return {
                  in(_, values) {
                    state.siteQueries.push(values);
                    const data = values
                      .filter(value => state.sites.has(value))
                      .map(id => ({ id }));
                    return Promise.resolve({ data, error: null });
                  }
                };
              },
              upsert(rows) {
                state.siteUpserts.push(...rows);
                rows.forEach(row => {
                  if (row?.id) {
                    state.sites.add(row.id);
                  }
                });
                return Promise.resolve({ data: rows, error: null });
              }
            };
          }

          if (table === 'site_configs') {
            return {
              select() {
                return {
                  in(_, values) {
                    state.configQueries.push(values);
                    const data = values
                      .map(value => state.siteConfigs.get(value))
                      .filter(Boolean)
                      .map(record => ({ ...record }));
                    return Promise.resolve({ data, error: null });
                  }
                };
              }
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }
      };
    }
  };
}

test('normalizeRange clamps boundaries to full-day ISO strings', () => {
  const { from, to } = normalizeRange('2025-01-01', '2025-01-05');
  assert.equal(from, '2025-01-01T00:00:00.000Z');
  assert.equal(to, '2025-01-05T23:59:59.999Z');
});

test('mapPostingToOrder maps analytics and financial data into order totals', () => {
  const posting = {
    posting_number: 'OZ-1001',
    status: 'delivered',
    created_at: '2024-09-01T08:30:00Z',
    analytics_data: {
      revenue: 200,
      currency_code: 'RUB',
      delivery_amount: 15
    },
    financial_data: {
      posting_is_paid: true,
      posting_services: {
        marketplace_service_item_fulfillment: 12
      },
      products: [
        { sku: 'SKU-1', name: 'Item 1', quantity: 2, price: 50, total_price: 100, cost_price: 30 },
        { sku: 'SKU-2', name: 'Item 2', quantity: 1, price: 60, total_price: 60, cost_price: 20 }
      ]
    }
  };

  const mapped = mapPostingToOrder(posting, { siteId: 'ozon_main', type: 'fbs' });
  assert.ok(mapped);
  assert.equal(mapped.order.order_no, 'OZ-1001');
  assert.equal(mapped.order.platform, 'ozon');
  assert.equal(mapped.order.currency, 'RUB');
  assert.equal(mapped.order.subtotal, 160);
  assert.equal(mapped.order.total, 200);
  assert.equal(mapped.order.shipping_fee, 15);
  assert.equal(mapped.order.logistics_cost, 12);
  assert.equal(mapped.order.cost_of_goods, 80);
  assert.equal(mapped.order.settlement_status, 'settled');
  assert.equal(mapped.items.length, 2);
  assert.equal(mapped.items[0].sku, 'SKU-1');
  assert.equal(mapped.items[0].total_price, 100);
  assert.equal(mapped.items[1].sku, 'SKU-2');
});

test('aggregatePostings merges duplicate postings and concatenates items', () => {
  const postings = [
    {
      posting_number: 'OZ-2001',
      status: 'delivered',
      created_at: '2024-09-02T08:00:00Z',
      analytics_data: { revenue: 120, currency_code: 'RUB' },
      financial_data: {
        posting_services: { marketplace_service_item_fulfillment: 5 },
        products: [
          { sku: 'SKU-A', name: 'Bundle A', quantity: 1, price: 40, total_price: 40, cost_price: 18 }
        ]
      }
    },
    {
      posting_number: 'OZ-2001',
      status: 'delivered',
      created_at: '2024-09-03T09:00:00Z',
      analytics_data: { revenue: 60, currency_code: 'RUB' },
      financial_data: {
        posting_services: { marketplace_service_item_fulfillment: 3 },
        products: [
          { sku: 'SKU-B', name: 'Bundle B', quantity: 2, price: 30, total_price: 60, cost_price: 15 }
        ]
      }
    }
  ];

  const aggregated = aggregatePostings(postings, 'ozon_main');
  assert.equal(aggregated.orders.length, 1);
  const [order] = aggregated.orders;
  assert.equal(order.order_no, 'OZ-2001');
  assert.equal(order.subtotal, 100);
  assert.equal(order.total, 180);
  assert.equal(order.logistics_cost, 8);
  assert.equal(order.currency, 'RUB');
  assert.equal(aggregated.items.length, 2);
  assert.deepEqual(
    aggregated.items.map(item => item.sku).sort(),
    ['SKU-A', 'SKU-B']
  );
});

test('parseOzonResponse tolerates trailing noise around JSON payloads', () => {
  const text = '\n\n{"result":{"postings":[{"id":1}]}}\n<html>gateway error</html>';
  const parsed = parseOzonResponse(text, 'fbo');
  assert.equal(parsed.result.postings[0].id, 1);
});

test('parseOzonResponse surfaces snippet when payload is not JSON', () => {
  let caught;
  try {
    parseOzonResponse('<html>503</html>', 'fbo');
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof Error);
  assert.match(caught.message, /返回非 JSON/);
  assert.match(caught.message, /<html>503<\/html>/);
});

test('extractJsonSegment returns first valid JSON block within noisy response', () => {
  const noisy = 'x{"outer":{"inner":1}}{"ignored":true}';
  const segment = extractJsonSegment(noisy);
  assert.equal(segment, '{"outer":{"inner":1}}');
});

test('syncOzonOrders continues when FBO endpoint returns 404', async () => {
  const postings = [{
    posting_number: 'OZ-3001',
    status: 'delivered',
    created_at: '2024-09-10T08:00:00Z',
    analytics_data: {
      revenue: 120,
      currency_code: 'RUB',
      delivery_amount: 10
    },
    financial_data: {
      posting_is_paid: true,
      posting_services: {
        marketplace_service_item_fulfillment: 6
      },
      products: [
        {
          sku: 'SKU-404',
          name: 'Resilient Item',
          quantity: 1,
          price: 120,
          total_price: 120,
          cost_price: 70
        }
      ]
    }
  }];

  const fetchImpl = async (url) => {
    if (url.includes('/fbs/')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: { postings } })
      };
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '404 page not found'
    };
  };

  const supabase = createSupabaseStub();

  const { summary } = await syncOzonOrders({
    fetchImpl,
    supabase,
    creds: { clientId: 'id', apiKey: 'key' },
    siteId: 'ozon_main',
    from: '2024-09-01T00:00:00.000Z',
    to: '2024-09-15T23:59:59.999Z',
    limit: 50,
    shouldSync: true,
    loadProductMetadata: async () => new Map(),
    enrichProducts: async orders => orders
  });

  assert.equal(summary.fetched, 1);
  assert.equal(summary.types.fbs, 1);
  assert.equal(summary.types.fbo, 0);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.errors[0].type, 'fbo');
  assert.match(summary.errors[0].message, /HTTP 404/);
});

test('syncOzonOrders surfaces missing site configuration before writing', async () => {
  const postings = [{
    posting_number: 'OZ-5001',
    status: 'delivered',
    created_at: '2024-09-20T08:00:00Z',
    analytics_data: { revenue: 50, currency_code: 'RUB' },
    financial_data: {
      posting_is_paid: false,
      products: [
        { sku: 'SKU-5001', name: 'Missing Site Item', quantity: 1, price: 50, total_price: 50 }
      ]
    }
  }];

  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ result: { postings: url.includes('/fbs/') ? postings : [] } })
  });

  const supabase = createSupabaseStub({ sites: [] });

  await assert.rejects(
    () => syncOzonOrders({
      fetchImpl,
      supabase,
      creds: { clientId: 'id', apiKey: 'key' },
      siteId: 'ozon_unknown',
      from: '2024-09-18T00:00:00.000Z',
      to: '2024-09-20T23:59:59.999Z',
      limit: 20,
      shouldSync: true,
      loadProductMetadata: async () => new Map(),
      enrichProducts: async orders => orders
    }),
    (error) => {
      assert.equal(error.code, 'SITE_NOT_FOUND');
      assert.match(error.message, /未找到以下站点/);
      assert.deepEqual(error.missingSites, ['ozon_unknown']);
      return true;
    }
  );
});

test('syncOzonOrders auto registers site metadata from site_configs', async () => {
  const siteId = 'ozon_211440331';
  const postings = [{
    posting_number: 'OZ-6001',
    status: 'delivered',
    created_at: '2024-09-22T08:00:00Z',
    analytics_data: { revenue: 80, currency_code: 'RUB', delivery_amount: 5 },
    financial_data: {
      posting_is_paid: true,
      posting_services: { marketplace_service_item_fulfillment: 3 },
      products: [
        { sku: 'SKU-6001', name: 'Auto Site Item', quantity: 1, price: 80, total_price: 80, cost_price: 40 }
      ]
    }
  }];

  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ result: { postings: url.includes('/fbs/') ? postings : [] } })
  });

  const supabase = createSupabaseStub({
    sites: [],
    siteConfigs: [
      {
        id: siteId,
        name: '211440331',
        display_name: 'Ozon 主站',
        platform: 'ozon',
        is_active: true
      }
    ]
  });

  const { summary } = await syncOzonOrders({
    fetchImpl,
    supabase,
    creds: { clientId: 'id', apiKey: 'key' },
    siteId,
    from: '2024-09-20T00:00:00.000Z',
    to: '2024-09-22T23:59:59.999Z',
    limit: 20,
    shouldSync: true,
    loadProductMetadata: async () => new Map(),
    enrichProducts: async orders => orders
  });

  assert.equal(summary.persisted, 1);
  assert.ok(supabase.state.sites.has(siteId));
  assert.equal(supabase.state.siteUpserts.length, 1);
  assert.deepEqual(supabase.state.siteUpserts[0], {
    id: siteId,
    name: '211440331',
    display_name: 'Ozon 主站',
    platform: 'ozon',
    is_active: true
  });
});

test('syncOzonOrders enriches order items with product metadata loader', async () => {
  const supabase = createSupabaseStub();
  supabase.state.queryData = [{
    id: 'order-1',
    order_no: 'OZ-7001',
    site_id: 'ozon_main',
    platform: 'ozon',
    order_items: [
      {
        id: 'item-1',
        sku: 'SKU-777',
        product_name: '',
        quantity: 1,
        unit_price: 10,
        total_price: 10,
        cost_price: 4
      }
    ]
  }];

  const metadataMap = new Map([
    ['SKU-777', { name: '示例商品', image: 'https://cdn.example.com/sku-777.jpg' }]
  ]);

  const { orders } = await syncOzonOrders({
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"result":{"postings":[]}}' }),
    supabase,
    creds: { clientId: 'id', apiKey: 'key' },
    siteId: 'ozon_main',
    from: '2024-09-01T00:00:00.000Z',
    to: '2024-09-02T23:59:59.999Z',
    limit: 10,
    shouldSync: false,
    loadProductMetadata: async (skus) => {
      assert.deepEqual(skus, ['SKU-777']);
      return metadataMap;
    }
  });

  assert.equal(orders.length, 1);
  assert.equal(orders[0].order_items.length, 1);
  assert.equal(orders[0].order_items[0].product_name, '示例商品');
  assert.equal(orders[0].order_items[0].product_image, 'https://cdn.example.com/sku-777.jpg');
});
