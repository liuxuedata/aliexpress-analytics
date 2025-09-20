'use strict';

function isObjectLike(value) {
  return value !== null && typeof value === 'object';
}

function normalizeKeys(target) {
  if (typeof target === 'function') {
    return target;
  }
  const keys = Array.isArray(target) ? target : [target];
  return (candidateKey) => keys.includes(candidateKey);
}

function coerceMaxDepth(maxDepth) {
  if (maxDepth === undefined || maxDepth === null) {
    return Infinity;
  }
  const depth = Number(maxDepth);
  if (!Number.isFinite(depth) || depth < 0) {
    return Infinity;
  }
  return Math.floor(depth);
}

function findKeyDeep(source, targetKey, options = {}) {
  if (!isObjectLike(source)) {
    return null;
  }

  const matcher = normalizeKeys(targetKey);
  const maxDepth = coerceMaxDepth(options.maxDepth);
  const predicate = typeof options.predicate === 'function' ? options.predicate : null;
  const visited = new Set();
  const stack = [{ node: source, depth: 0, path: [] }];

  while (stack.length > 0) {
    const current = stack.pop();
    const { node, depth, path } = current;

    if (!isObjectLike(node)) {
      continue;
    }

    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const value = node[key];
      const nextDepth = depth + 1;
      const nextPath = path.concat(key);
      let descend = isObjectLike(value) && nextDepth <= maxDepth;

      if (matcher(key, value, { path: nextPath, parent: node, depth: nextDepth })) {
        let accepted = false;
        let resolvedValue = value;

        if (predicate) {
          const result = predicate({ key, value, parent: node, depth: nextDepth, path: nextPath });

          if (result && typeof result === 'object' && 'accept' in result) {
            if (result.accept) {
              accepted = true;
              if (Object.prototype.hasOwnProperty.call(result, 'value')) {
                resolvedValue = result.value;
              }
            }
            if (result.skipChildren) {
              descend = false;
            }
          } else if (result) {
            accepted = true;
            if (result !== true) {
              resolvedValue = result;
            }
          }
        } else {
          accepted = true;
        }

        if (accepted) {
          return { key, value: resolvedValue, parent: node, depth: nextDepth, path: nextPath };
        }
      }

      if (descend) {
        stack.push({ node: value, depth: nextDepth, path: nextPath });
      }
    }
  }

  return null;
}

module.exports = { findKeyDeep };
