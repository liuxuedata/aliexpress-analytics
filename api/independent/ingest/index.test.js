const { _parseDay } = require('./index.js');
const test = require('node:test');
const assert = require('assert');

test('parses slash-separated date', () => {
  const d = _parseDay('2025/8/18');
  assert.ok(d);
  assert.strictEqual(d.toISOString().slice(0,10), '2025-08-18');
});

test('parses numeric yyyymmdd', () => {
  const d = _parseDay(20250818);
  assert.ok(d);
  assert.strictEqual(d.toISOString().slice(0,10), '2025-08-18');
});

test('invalid date returns null', () => {
  assert.strictEqual(_parseDay('not-a-date'), null);
});

