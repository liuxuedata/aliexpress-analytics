const test = require('node:test');
const assert = require('node:assert/strict');

const { findKeyDeep } = require('../lib/find-key-deep');

test('findKeyDeep locates nested keys and allows predicate transformation', () => {
  const payload = {
    outer: {
      inner: {
        token: 'value',
      },
    },
  };

  const match = findKeyDeep(payload, 'token', {
    predicate: ({ value }) => {
      if (typeof value === 'string') {
        return value.toUpperCase();
      }
      return { accept: false };
    },
  });

  assert.ok(match);
  assert.equal(match.value, 'VALUE');
  assert.deepEqual(match.path, ['outer', 'inner', 'token']);
});

test('findKeyDeep continues when predicate rejects current match', () => {
  const payload = {
    token: '',
    nested: {
      token: 'nested-token',
    },
  };

  let predicateCalls = 0;
  const match = findKeyDeep(payload, 'token', {
    predicate: ({ value }) => {
      predicateCalls += 1;
      if (typeof value === 'string' && value.trim()) {
        return { accept: true, value };
      }
      return { accept: false };
    },
  });

  assert.ok(match);
  assert.equal(predicateCalls, 2);
  assert.equal(match.value, 'nested-token');
});

test('findKeyDeep respects maxDepth constraints', () => {
  const payload = {
    level1: {
      level2: {
        token: 'deep',
      },
    },
  };

  const tooShallow = findKeyDeep(payload, 'token', { maxDepth: 1 });
  assert.equal(tooShallow, null);

  const deepEnough = findKeyDeep(payload, 'token', { maxDepth: 2 });
  assert.ok(deepEnough);
  assert.equal(deepEnough.value, 'deep');
});

test('findKeyDeep avoids infinite loops for cyclic objects', () => {
  const root = {};
  const child = { token: 'cycle' };
  root.self = root;
  root.child = child;
  child.parent = root;

  const match = findKeyDeep(root, 'token');
  assert.ok(match);
  assert.equal(match.value, 'cycle');
});
