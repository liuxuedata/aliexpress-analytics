const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRange,
  mapPostingToOrder,
  aggregatePostings,
  parseOzonResponse,
  extractJsonSegment
} = require('../lib/ozon-orders');

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
