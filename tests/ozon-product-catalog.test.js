const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchProductMetadata } = require('../lib/ozon-product-catalog');

test('fetchProductMetadata maps numeric identifiers to product_id and extracts images', async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        result: {
          items: [
            {
              offer_id: '272642345',
              name: '示例商品',
              primary_image: 'https://cdn.example.com/272642345.jpg'
            }
          ]
        }
      })
    };
  };

  const metadata = await fetchProductMetadata({
    fetchImpl,
    creds: { clientId: 'id', apiKey: 'key' },
    parseOzonResponse: JSON.parse,
    supabase: null,
    skus: ['272642345']
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].offer_id, ['272642345']);
  assert.deepEqual(calls[0].product_id, [272642345]);
  assert.deepEqual(calls[0].sku, [272642345]);

  assert.ok(metadata instanceof Map);
  const entry = metadata.get('272642345');
  assert.equal(entry.name, '示例商品');
  assert.equal(entry.image, 'https://cdn.example.com/272642345.jpg');
});
