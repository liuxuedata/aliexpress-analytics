'use strict';

function normalizeKeys(keys) {
  const input = keys instanceof Set ? Array.from(keys) : Array.isArray(keys) ? keys : [keys];
  return new Set(input.filter(Boolean).map((key) => String(key).toLowerCase()));
}

function maskPathSegment(path, key) {
  return path ? `${path}.${key}` : String(key);
}

function findKeyDeep(input, keys, maxDepth = 10) {
  if (input == null) return null;
  const wanted = normalizeKeys(keys);
  if (!wanted.size) {
    return null;
  }

  const stack = [{ val: input, path: '', depth: 0 }];
  const seen = new Set();

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const { val, path, depth } = current;
    if (depth > maxDepth) continue;

    if (val && typeof val === 'object') {
      if (seen.has(val)) {
        continue;
      }
      seen.add(val);

      if (Array.isArray(val)) {
        for (let i = val.length - 1; i >= 0; i -= 1) {
          stack.push({ val: val[i], path: `${path}[${i}]`, depth: depth + 1 });
        }
        continue;
      }

      const entries = Object.entries(val);
      for (const [key, value] of entries) {
        if (wanted.has(String(key).toLowerCase())) {
          return { value, path: maskPathSegment(path, key) };
        }
      }

      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const [key, value] = entries[i];
        stack.push({ val: value, path: maskPathSegment(path, key), depth: depth + 1 });
      }
    }
  }

  return null;
}

module.exports = {
  findKeyDeep,
};
