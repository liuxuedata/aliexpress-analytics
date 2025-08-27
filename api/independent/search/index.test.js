const { _aggregate, _buildPattern } = require('./index.js');
const test = require('node:test');
const assert = require('assert');

test('aggregate sums metrics and computes rates', () => {
  const rows = [
    { landing_path:'/a', landing_url:'/a', clicks:10, impr:20, cost:5, conversions:2, conv_value:30 },
    { landing_path:'/a', landing_url:'/a', clicks:5, impr:10, cost:3, conversions:1, conv_value:15 },
    { landing_path:'/b', landing_url:'/b', clicks:2, impr:4, cost:1, conversions:0, conv_value:0 },
  ];
  const res = _aggregate(rows).sort((x,y)=>x.landing_path.localeCompare(y.landing_path));
  assert.deepStrictEqual(res, [
    { landing_path:'/a', landing_url:'/a', clicks:15, impr:30, cost:8, conversions:3, conv_value:45, ctr:0.5, conv_rate:0.2 },
    { landing_path:'/b', landing_url:'/b', clicks:2, impr:4, cost:1, conversions:0, conv_value:0, ctr:0.5, conv_rate:0 }
  ]);
});

test('buildPattern joins tokens with wildcards', () => {
  assert.strictEqual(_buildPattern('bestway inflatable pool'), '%bestway%inflatable%pool%');
});
