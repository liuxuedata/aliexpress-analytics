const DEFAULT_RANGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const {
  createProductMetadataLoader,
  applyMetadataToItems,
  enrichOrdersWithCatalog,
  normalizeSku
} = require('./ozon-product-catalog');

const ORDER_STATUS_MAP = {
  awaiting_approve: 'pending',
  awaiting_packaging: 'pending',
  awaiting_deliver: 'confirmed',
  delivering: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  cancelled_by_customer: 'cancelled',
  cancelled_by_marketplace: 'cancelled'
};

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toCurrency(value, fallback = 0) {
  const num = toNumber(value, fallback);
  const rounded = Math.round(num * 100) / 100;
  return Number.isFinite(rounded) ? rounded : fallback;
}

function toInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function ensureDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeRange(fromInput, toInput) {
  const now = new Date();
  const toDate = ensureDate(toInput) || now;
  const fromDate = ensureDate(fromInput) || new Date(toDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY);

  if (fromDate > toDate) {
    // Swap if the range is inverted
    const tmp = new Date(fromDate);
    fromDate.setTime(toDate.getTime());
    toDate.setTime(tmp.getTime());
  }

  const normalizedFrom = new Date(Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
    0, 0, 0, 0
  ));
  const normalizedTo = new Date(Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate(),
    23, 59, 59, 999
  ));

  return {
    from: normalizedFrom.toISOString(),
    to: normalizedTo.toISOString()
  };
}

function pickFirstNumber(values, fallback = 0) {
  if (!Array.isArray(values)) return fallback;
  for (const value of values) {
    const num = toNumber(value);
    if (Number.isFinite(num) && num !== 0) {
      return num;
    }
  }
  return toNumber(values.find(v => Number.isFinite(Number(v))), fallback);
}

function deriveSettlementStatus(status, isPaid) {
  if (isPaid === true) return 'settled';
  if (!status) return 'pending';
  if (status === 'delivered') return 'settled';
  if (status === 'delivering') return 'partial';
  if (status === 'awaiting_deliver') return 'partial';
  return 'pending';
}

function normalizeStatus(status) {
  if (!status) return 'pending';
  const mapped = ORDER_STATUS_MAP[status];
  return mapped || 'pending';
}

function sumPostingServices(services) {
  if (!services || typeof services !== 'object') return 0;
  return Object.values(services).reduce((sum, value) => {
    const amount = toCurrency(value);
    if (!amount) return sum;
    return sum + amount;
  }, 0);
}

function parsePlacedAt(posting) {
  const candidates = [
    posting.in_process_at,
    posting.created_at,
    posting.shipped_at,
    posting.delivery_due_date,
    posting.delivered_at
  ];

  for (const candidate of candidates) {
    const date = ensureDate(candidate);
    if (date) return date.toISOString();
  }

  return new Date().toISOString();
}

function normalizeSettlementDate(posting) {
  const date = ensureDate(posting.delivered_at || posting.execution_date || posting.shipped_at);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function extractProducts(posting) {
  const financialProducts = Array.isArray(posting?.financial_data?.products)
    ? posting.financial_data.products
    : [];
  if (financialProducts.length) return financialProducts;
  const postingProducts = Array.isArray(posting?.products) ? posting.products : [];
  return postingProducts;
}

function resolveCurrency(posting, products) {
  const analyticsCurrency = posting?.analytics_data?.currency_code;
  if (analyticsCurrency) return analyticsCurrency;
  for (const product of products) {
    if (product?.currency_code) return product.currency_code;
    if (product?.price_data?.currency) return product.price_data.currency;
  }
  if (posting?.financial_data?.currency) return posting.financial_data.currency;
  return 'RUB';
}

function mapProductToOrderItem(product, index, currency) {
  const quantity = toInteger(product?.quantity || product?.quantity_in_posting || product?.sold_quantity || 1, 1);
  const priceCandidates = [
    product?.price,
    product?.client_price,
    product?.price_data?.price,
    product?.price_data?.old_price,
    product?.price_without_discount,
    product?.item_price
  ];
  const unitPrice = toCurrency(pickFirstNumber(priceCandidates, product?.result_price || product?.sale_price || 0));

  const totalPriceCandidates = [
    product?.total_price,
    product?.price_sum,
    product?.result_price,
    unitPrice * quantity
  ];
  const totalPrice = toCurrency(pickFirstNumber(totalPriceCandidates, unitPrice * quantity));

  const costPrice = toCurrency(
    pickFirstNumber([
      product?.cost_price,
      product?.original_price,
      product?.price_data?.old_price,
      product?.purchase_price
    ])
  );

  const sku = product?.sku || product?.offer_id || product?.item_code || product?.product_id || `item-${index + 1}`;
  const productName = product?.name || product?.product_name || product?.offer_id || sku;

  return {
    sku: String(sku),
    product_name: productName,
    quantity,
    unit_price: unitPrice,
    total_price: totalPrice,
    cost_price: costPrice || null,
    currency
  };
}

function mergeOrderRecords(base, addition) {
  if (!base) return addition;
  const merged = { ...base };
  const numericKeys = [
    'subtotal',
    'discount',
    'shipping_fee',
    'tax',
    'total',
    'cost_of_goods',
    'logistics_cost'
  ];
  numericKeys.forEach(key => {
    const baseValue = toCurrency(base[key] || 0);
    const addValue = toCurrency(addition[key] || 0);
    const value = baseValue + addValue;
    merged[key] = toCurrency(value);
  });

  if (addition.status && addition.status !== base.status) {
    merged.status = addition.status;
  }
  if (addition.channel) merged.channel = addition.channel;
  if (addition.currency) merged.currency = addition.currency;
  if (addition.settlement_status) merged.settlement_status = addition.settlement_status;
  if (addition.settlement_date) merged.settlement_date = addition.settlement_date;
  if (addition.warehouse_id) merged.warehouse_id = addition.warehouse_id;

  if (addition.placed_at) {
    const addDate = ensureDate(addition.placed_at);
    const baseDate = ensureDate(base.placed_at);
    if (addDate && (!baseDate || addDate < baseDate)) {
      merged.placed_at = addDate.toISOString();
    }
  }

  if (addition.remark) {
    merged.remark = { ...(base.remark || {}), ...addition.remark };
  }

  return merged;
}

function mapPostingToOrder(posting, { siteId, type }) {
  if (!posting) return null;
  const products = extractProducts(posting);
  const currency = resolveCurrency(posting, products);
  const items = products.map((product, index) => mapProductToOrderItem(product, index, currency));

  const subtotal = items.reduce((sum, item) => sum + toCurrency(item.unit_price * item.quantity), 0);
  const discount = products.reduce((sum, product) => sum + toCurrency(
    pickFirstNumber([
      product?.total_discount_value,
      product?.discount_amount,
      product?.discount
    ])
  ), 0);
  const tax = products.reduce((sum, product) => sum + toCurrency(
    pickFirstNumber([
      product?.vat,
      product?.tax_amount,
      product?.tax_sum
    ])
  ), 0);
  const costOfGoods = items.reduce((sum, item) => sum + toCurrency((item.cost_price || 0) * item.quantity), 0);
  const analyticsTotal = toCurrency(
    pickFirstNumber([
      posting?.analytics_data?.revenue,
      posting?.analytics_data?.ordered_amount,
      subtotal - discount
    ])
  );
  const shippingFee = toCurrency(
    pickFirstNumber([
      posting?.analytics_data?.delivery_amount,
      posting?.financial_data?.posting_services?.marketplace_service_item_delivery
    ])
  );
  const logisticsCost = toCurrency(Math.abs(sumPostingServices(posting?.financial_data?.posting_services)));

  const orderNo = String(
    posting?.posting_number ||
    posting?.order_number ||
    posting?.id ||
    `${type || 'ozon'}-${posting?.posting_id || Date.now()}`
  );

  const remark = {
    posting_number: posting?.posting_number || posting?.order_number || null,
    posting_type: type,
    raw_status: posting?.status || null,
    analytics_snapshot: posting?.analytics_data ? {
      delivered_amount: posting.analytics_data.delivered_amount,
      cancelled_amount: posting.analytics_data.cancelled_amount,
      purchased_count: posting.analytics_data.purchased_count
    } : undefined
  };

  const orderRecord = {
    order_no: orderNo,
    site_id: siteId,
    platform: 'ozon',
    channel: posting?.delivery_method?.name || (type ? type.toUpperCase() : null),
    status: normalizeStatus(posting?.status),
    placed_at: parsePlacedAt(posting),
    currency,
    subtotal: toCurrency(subtotal),
    discount: toCurrency(discount),
    shipping_fee: toCurrency(Math.abs(shippingFee)),
    tax: toCurrency(tax),
    total: toCurrency(analyticsTotal || subtotal - discount),
    cost_of_goods: toCurrency(costOfGoods),
    logistics_cost: logisticsCost,
    settlement_status: deriveSettlementStatus(posting?.status, posting?.financial_data?.posting_is_paid),
    settlement_date: normalizeSettlementDate(posting),
    warehouse_id: posting?.warehouse_id || posting?.delivery_method?.warehouse_id || null,
    remark
  };

  return {
    order: orderRecord,
    items: items.map(item => ({ ...item, order_no: orderNo }))
  };
}

function aggregatePostings(postings, siteId, type) {
  const map = new Map();
  const allItems = [];

  postings.forEach(posting => {
    const mapped = mapPostingToOrder(posting, { siteId, type: posting.__ozonType || type });
    if (!mapped) return;
    const key = mapped.order.order_no;
    if (map.has(key)) {
      const current = map.get(key);
      const mergedOrder = mergeOrderRecords(current.order, mapped.order);
      const combinedItems = current.items.concat(mapped.items);
      map.set(key, { order: mergedOrder, items: combinedItems });
    } else {
      map.set(key, { order: mapped.order, items: mapped.items });
    }
  });

  map.forEach(value => {
    value.items.forEach(item => allItems.push(item));
  });

  return {
    orders: Array.from(map.values()).map(entry => entry.order),
    items: allItems
  };
}

function sanitizeSnippet(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, 160).trim();
}

function extractJsonSegment(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let start = -1;
  let openChar = '{';
  let closeChar = '}';

  if (firstBrace === -1 && firstBracket === -1) {
    return null;
  }

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    openChar = '[';
    closeChar = ']';
  } else {
    start = firstBrace;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === openChar) {
      depth += 1;
      if (depth === 1) {
        start = i;
      }
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return null;
}

function safeParseOzonJson(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.trim().replace(/^\uFEFF/, '');
  if (!normalized) return null;

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const segment = extractJsonSegment(normalized);
    if (segment) {
      try {
        return JSON.parse(segment);
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function parseOzonResponse(text, type) {
  const label = type ? String(type).toUpperCase() : 'UNKNOWN';
  const payload = typeof text === 'string' ? text.trim() : '';
  const normalized = payload.replace(/^\uFEFF/, '');
  if (!normalized) return {};

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const segment = extractJsonSegment(normalized);
    if (segment && segment !== normalized) {
      try {
        return JSON.parse(segment);
      } catch (innerError) {
        const snippet = sanitizeSnippet(normalized);
        throw new Error(`Ozon ${label} 返回非 JSON：${innerError.message}; 响应片段: ${snippet}`);
      }
    }

    const snippet = sanitizeSnippet(normalized);
    throw new Error(`Ozon ${label} 返回非 JSON：${error.message}; 响应片段: ${snippet}`);
  }
}

async function fetchPostings(fetchImpl, endpoint, creds, body, type) {
  const postings = [];
  let offset = 0;
  const limit = body.limit || 100;

  while (true) {
    const payload = { ...body, offset };
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Client-Id': creds.clientId,
        'Api-Key': creds.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (!response.ok) {
      const label = type ? String(type).toUpperCase() : 'UNKNOWN';
      const diagnostic = safeParseOzonJson(text);
      const snippet = sanitizeSnippet(text);
      const message = diagnostic?.message || response.statusText || 'Ozon API error';
      const error = new Error(`Ozon ${label} HTTP ${response.status}: ${message}${snippet ? `; 响应片段: ${snippet}` : ''}`);
      error.status = response.status;
      error.endpoint = endpoint;
      error.type = type;
      throw error;
    }

    const json = parseOzonResponse(text, type);

    const chunk = json?.result?.postings || json?.result?.items || json?.result || [];
    chunk.forEach(item => {
      item.__ozonType = type;
      postings.push(item);
    });

    if (!Array.isArray(chunk) || chunk.length < limit) break;
    offset += limit;
    if (offset > 5000) break; // safeguard against runaway loops
  }

  return postings;
}

async function ensureSitesExist(supabase, siteIds) {
  const uniqueIds = Array.from(new Set(siteIds.filter(Boolean)));
  if (!uniqueIds.length) return;

  const { data, error } = await supabase
    .schema('public')
    .from('sites')
    .select('id')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Supabase 查询站点失败：${error.message}`);
  }

  const found = new Set((data || []).map(row => row.id));
  let missing = uniqueIds.filter(id => !found.has(id));

  if (missing.length) {
    const { data: configs, error: configError } = await supabase
      .schema('public')
      .from('site_configs')
      .select('id,name,platform,display_name,is_active')
      .in('id', missing);

    if (configError) {
      throw new Error(`Supabase 查询站点配置失败：${configError.message}`);
    }

    const upsertRows = (configs || [])
      .filter(row => row?.id)
      .map(row => ({
        id: row.id,
        name: row.name || row.display_name || row.id,
        platform: row.platform || 'unknown',
        display_name: row.display_name || row.name || row.id,
        is_active: row.is_active !== undefined ? row.is_active : true
      }))
      .filter(row => missing.includes(row.id));

    if (upsertRows.length) {
      const { error: upsertError } = await supabase
        .schema('public')
        .from('sites')
        .upsert(upsertRows, { onConflict: 'id' });

      if (upsertError) {
        throw new Error(`Supabase 自动创建站点失败：${upsertError.message}`);
      }

      upsertRows.forEach(row => found.add(row.id));
    }

    missing = uniqueIds.filter(id => !found.has(id));
  }

  if (missing.length) {
    const err = new Error(`未找到以下站点，请先在站点管理中创建：${missing.join(', ')}`);
    err.code = 'SITE_NOT_FOUND';
    err.missingSites = missing;
    throw err;
  }
}

async function persistOrders(supabase, orders, items) {
  if (!orders.length) {
    return { orders: [], orderIdMap: new Map() };
  }

  await ensureSitesExist(supabase, orders.map(order => order.site_id));

  const { data: upsertedOrders, error: upsertError } = await supabase
    .schema('public')
    .from('orders')
    .upsert(orders, { onConflict: 'order_no' })
    .select();

  if (upsertError) {
    throw new Error(`Supabase upsert orders 失败：${upsertError.message}`);
  }

  const idMap = new Map();
  (upsertedOrders || []).forEach(order => {
    if (order?.order_no && order?.id) {
      idMap.set(order.order_no, order.id);
    }
  });

  const orderIds = Array.from(idMap.values());
  if (orderIds.length) {
    const { error: deleteError } = await supabase
      .schema('public')
      .from('order_items')
      .delete()
      .in('order_id', orderIds);

    if (deleteError) {
      throw new Error(`Supabase 删除旧订单明细失败：${deleteError.message}`);
    }
  }

  if (items.length) {
    const rows = items
      .map(item => {
        const orderId = idMap.get(item.order_no);
        if (!orderId) return null;
        const { order_no, currency, ...rest } = item;
        return {
          ...rest,
          order_id: orderId
        };
      })
      .filter(Boolean);

    if (rows.length) {
      const { error: insertError } = await supabase
        .schema('public')
        .from('order_items')
        .insert(rows);

      if (insertError) {
        throw new Error(`Supabase 插入订单明细失败：${insertError.message}`);
      }
    }
  }

  return { orders: upsertedOrders || [], orderIdMap: idMap };
}

async function queryOrders(supabase, { siteId, from, to, limit = 200 }) {
  let query = supabase
    .schema('public')
    .from('orders')
    .select(`
      id,
      order_no,
      site_id,
      platform,
      channel,
      status,
      settlement_status,
      settlement_date,
      placed_at,
      currency,
      subtotal,
      discount,
      shipping_fee,
      tax,
      total,
      cost_of_goods,
      logistics_cost,
      remark,
      order_items (id, sku, product_name, quantity, unit_price, total_price, cost_price)
    `)
    .eq('platform', 'ozon')
    .eq('site_id', siteId)
    .order('placed_at', { ascending: false });

  if (from) query = query.gte('placed_at', from);
  if (to) query = query.lte('placed_at', to);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Supabase 查询 Ozon 订单失败：${error.message}`);
  }
  return data || [];
}

async function syncOzonOrders({
  fetchImpl,
  supabase,
  creds,
  siteId,
  from,
  to,
  limit = 200,
  shouldSync = true,
  loadProductMetadata,
  enrichProducts
}) {
  const summary = {
    fetched: 0,
    persisted: 0,
    types: {
      fbs: 0,
      fbo: 0
    },
    errors: []
  };

  const metadataLoader = typeof loadProductMetadata === 'function'
    ? loadProductMetadata
    : createProductMetadataLoader({
        supabase,
        fetchImpl,
        creds,
        parseOzonResponse
      });

  let prefetchedMetadata = new Map();

  if (shouldSync) {
    const baseBody = {
      dir: 'asc',
      limit: 100,
      offset: 0,
      with: {
        analytics_data: true,
        financial_data: true,
        barcodes: false
      },
      filter: {
        since: from,
        to,
        status: '',
        delivery_method_id: [],
        warehouse_id: [],
        posting_number: ''
      }
    };

    const endpoints = [
      { type: 'fbs', endpoint: 'https://api-seller.ozon.ru/v3/posting/fbs/list', optional: false },
      { type: 'fbo', endpoint: 'https://api-seller.ozon.ru/v3/posting/fbo/list', optional: true }
    ];

    const collected = [];

    for (const config of endpoints) {
      try {
        const postings = await fetchPostings(fetchImpl, config.endpoint, creds, baseBody, config.type);
        summary.types[config.type] = postings.length;
        summary.fetched += postings.length;
        collected.push(...postings);
      } catch (error) {
        summary.errors.push({
          type: config.type,
          endpoint: config.endpoint,
          status: error.status || null,
          message: error.message
        });

        if (!config.optional) {
          throw error;
        }
      }
    }

    if (!collected.length && summary.errors.length === endpoints.length) {
      const combined = summary.errors.map(err => `${err.type.toUpperCase()}: ${err.message}`).join('; ');
      throw new Error(`Ozon postings 拉取失败：${combined}`);
    }

    const aggregated = aggregatePostings(collected, siteId);

    if (aggregated.items.length && typeof metadataLoader === 'function') {
      const skus = aggregated.items
        .map(item => normalizeSku(item?.sku))
        .filter(Boolean);
      if (skus.length) {
        try {
          prefetchedMetadata = await metadataLoader(skus);
          if (prefetchedMetadata instanceof Map && prefetchedMetadata.size) {
            aggregated.items = applyMetadataToItems(aggregated.items, prefetchedMetadata);
          }
        } catch (error) {
          prefetchedMetadata = new Map();
          console.warn('[ozon] Unable to enrich posting items with product metadata:', error.message);
        }
      }
    }

    if (aggregated.orders.length) {
      await persistOrders(supabase, aggregated.orders, aggregated.items);
      summary.persisted = aggregated.orders.length;
    }
  }

  let orders = await queryOrders(supabase, { siteId, from, to, limit });

  if (typeof enrichProducts === 'function') {
    orders = await enrichProducts(orders, { siteId, from, to });
  } else {
    orders = await enrichOrdersWithCatalog({
      orders,
      metadataLoader,
      prefetchedMetadata
    });
  }

  return { orders, summary };
}

module.exports = {
  normalizeRange,
  mapPostingToOrder,
  aggregatePostings,
  sumPostingServices,
  syncOzonOrders,
  toCurrency,
  toNumber,
  parseOzonResponse,
  extractJsonSegment
};
