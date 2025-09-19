const test = require('node:test');
const assert = require('node:assert/strict');

const { createSignedState, decodeState } = require('../lib/lazada-oauth-state');

test('createSignedState encodes payload with signature', () => {
  const state = createSignedState({ siteId: 'lazada_site' }, { secret: 'secret' });
  assert.ok(typeof state === 'string');
  const decoded = decodeState(state, { secret: 'secret' });
  assert.equal(decoded.siteId, 'lazada_site');
  assert.ok(decoded.nonce);
  assert.ok(decoded.ts);
});

test('decodeState rejects invalid signature', () => {
  const state = createSignedState({ siteId: 'lazada_site' }, { secret: 'secret' });
  const decoded = decodeState(state, { secret: 'another-secret' });
  assert.deepEqual(decoded, {});
});

test('decodeState supports query string fallback', () => {
  const decoded = decodeState('siteId=my_site', { secret: 'secret' });
  assert.equal(decoded.siteId, 'my_site');
});
