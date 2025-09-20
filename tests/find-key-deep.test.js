const test = require('node:test');
const assert = require('node:assert/strict');

const { findKeyDeep } = require('../lib/find-key-deep');

test('findKeyDeep locates first matching key regardless of nesting', () => {
  const payload = {
    data: {
      wrapper: [
        { accessToken: 'first' },
        { refresh_token: 'second' },
      ],
      meta: { refresh_token: 'third' }
    }
  };

  const refresh = findKeyDeep(payload, ['refresh_token']);
  assert.equal(refresh.value, 'second');
  assert.equal(refresh.path, 'data.wrapper[1].refresh_token');

  const access = findKeyDeep(payload, ['accesstoken']);
  assert.equal(access.value, 'first');
  assert.equal(access.path, 'data.wrapper[0].accessToken');
});

test('findKeyDeep respects maximum depth and avoids cycles', () => {
  const payload = { level0: { level1: { target: 'found' } } };
  assert.equal(findKeyDeep(payload, ['target'], 0), null);

  const circular = {};
  circular.self = circular;
  assert.equal(findKeyDeep(circular, ['missing']), null);
});
