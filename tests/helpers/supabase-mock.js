function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function applyFilters(rows, filters) {
  return filters.reduce((acc, filter) => acc.filter(filter), rows);
}

function applyOrder(rows, orderings) {
  if (!orderings.length) return rows;
  return rows.slice().sort((a, b) => {
    for (const { column, ascending } of orderings) {
      const left = a[column];
      const right = b[column];
      if (left === right) continue;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      if (left < right) return ascending ? -1 : 1;
      if (left > right) return ascending ? 1 : -1;
    }
    return 0;
  });
}

function createSelectBuilder(state, table) {
  const filters = [];
  const orderings = [];
  let limitValue = null;

  const builder = {
    select() { return this; },
    eq(column, value) { filters.push(row => row[column] === value); return this; },
    in(column, values) { const list = Array.isArray(values) ? values : [values]; filters.push(row => list.includes(row[column])); return this; },
    gte(column, value) { filters.push(row => row[column] >= value); return this; },
    lte(column, value) { filters.push(row => row[column] <= value); return this; },
    order(column, options = {}) { orderings.push({ column, ascending: options.ascending !== false }); return this; },
    limit(value) { limitValue = value; return this; },
    then(resolve, reject) {
      try {
        const rows = state[table] || [];
        let data = applyFilters(rows, filters);
        data = applyOrder(data, orderings);
        if (Number.isInteger(limitValue)) {
          data = data.slice(0, limitValue);
        }
        return Promise.resolve({ data: clone(data), error: null }).then(resolve, reject);
      } catch (err) {
        return Promise.resolve({ data: null, error: err }).then(resolve, reject);
      }
    }
  };

  return builder;
}

function upsertRows(state, table, rows, conflictKeys, generateId) {
  const list = ensureArray(rows);
  const result = [];
  list.forEach(row => {
    if (!row) return;
    const existingIndex = state[table].findIndex(existing => conflictKeys.every(key => existing[key] === row[key]));
    if (existingIndex >= 0) {
      state[table][existingIndex] = { ...state[table][existingIndex], ...clone(row) };
      result.push(state[table][existingIndex]);
    } else {
      const record = { ...clone(row) };
      if (!record.id && typeof generateId === 'function') {
        record.id = generateId();
      }
      state[table].push(record);
      result.push(record);
    }
  });
  return result;
}

function createSupabaseMock(initial = {}) {
  const state = {
    integration_tokens: ensureArray(initial.integration_tokens || initial.tokens),
    site_configs: ensureArray(initial.site_configs || initial.siteConfigs),
    sites: ensureArray(initial.sites),
    site_metrics_daily: ensureArray(initial.site_metrics_daily),
    product_metrics_daily: ensureArray(initial.product_metrics_daily),
    orders: ensureArray(initial.orders),
    order_items: ensureArray(initial.order_items),
    ad_campaigns: ensureArray(initial.ad_campaigns),
    ad_metrics_daily: ensureArray(initial.ad_metrics_daily),
    ad_metrics_map: new Map(),
    counters: {
      orders: 0,
      campaigns: 0,
      metrics: 0
    }
  };

  function getSchema(schemaName) {
    if (schemaName !== 'public') {
      throw new Error(`Unsupported schema: ${schemaName}`);
    }
    return {
      from(table) {
        if (!(table in state)) {
          state[table] = [];
        }
        const rows = state[table];

        if (table === 'integration_tokens') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              const result = upsertRows(state, table, payload, ['site_id', 'provider']);
              return {
                select() {
                  return Promise.resolve({ data: clone(result), error: null });
                }
              };
            }
          };
        }

        if (table === 'site_configs') {
          return {
            select() { return createSelectBuilder(state, table); }
          };
        }

        if (table === 'sites') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              upsertRows(state, table, payload, ['id']);
              return Promise.resolve({ data: clone(ensureArray(payload)), error: null });
            }
          };
        }

        if (table === 'site_metrics_daily') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              upsertRows(state, table, payload, ['site', 'channel', 'stat_date']);
              return Promise.resolve({ data: clone(ensureArray(payload)), error: null });
            }
          };
        }

        if (table === 'product_metrics_daily') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              upsertRows(state, table, payload, ['site', 'sku', 'stat_date']);
              return Promise.resolve({ data: clone(ensureArray(payload)), error: null });
            }
          };
        }

        if (table === 'orders') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              const result = upsertRows(state, table, payload, ['order_no'], () => `order-${++state.counters.orders}`);
              return {
                select() {
                  return Promise.resolve({ data: clone(result), error: null });
                }
              };
            }
          };
        }

        if (table === 'order_items') {
          return {
            select() { return createSelectBuilder(state, table); },
            insert(payload) {
              ensureArray(payload).forEach(row => state[table].push(clone(row)));
              return Promise.resolve({ error: null });
            },
            delete() {
              return {
                in(column, values) {
                  const list = Array.isArray(values) ? values : [values];
                  state[table] = rows.filter(row => !list.includes(row[column]));
                  return Promise.resolve({ error: null });
                }
              };
            }
          };
        }

        if (table === 'ad_campaigns') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              const result = upsertRows(state, table, payload, ['site_id', 'platform', 'campaign_id'], () => `campaign-${++state.counters.campaigns}`);
              return {
                select() {
                  return Promise.resolve({ data: clone(result), error: null });
                }
              };
            }
          };
        }

        if (table === 'ad_metrics_daily') {
          return {
            select() { return createSelectBuilder(state, table); },
            upsert(payload) {
              ensureArray(payload).forEach(row => {
                const existingIndex = state[table].findIndex(existing => existing.campaign_id === row.campaign_id && existing.date === row.date);
                if (existingIndex >= 0) {
                  state[table][existingIndex] = { ...state[table][existingIndex], ...clone(row) };
                } else {
                  const record = { id: `metric-${++state.counters.metrics}`, ...clone(row) };
                  state[table].push(record);
                }
              });
              return Promise.resolve({ data: clone(ensureArray(payload)), error: null });
            }
          };
        }

        return {
          select() { return createSelectBuilder(state, table); }
        };
      }
    };
  }

  return {
    state,
    schema: getSchema
  };
}

module.exports = {
  createSupabaseMock
};
