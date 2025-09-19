const { normalizeRange, toNumber, toCurrency, coerceDate } = require('./lazada-utils');
const { ensureAccessToken } = require('./lazada-auth');
const { resolveApiHost, callLazadaApi } = require('./lazada-api');

const STATUS_MAP = {
  pending: 'pending',
  unpaid: 'pending',
  unfulfilled: 'confirmed',
  processing: 'confirmed',
  ready_to_ship: 'confirmed',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'cancelled'
};

const SETTLEMENT_STATUS_MAP = {
  pending: 'pending',
  unpaid: 'pending',
  paid: 'settled',
  delivered: 'settled',
  refunded: 'cancelled',
  cancelled: 'cancelled'
};

const DEFAULT_PAGE_SIZE = 50;

function normalizeStatus(status) {
  if (!status) return 'pending';
  const key = String(status).toLowerCase();
  return STATUS_MAP[key] || 'pending';
}

function normalizeSettlementStatus(status, paymentStatus) {
  if (paymentStatus) {
    const key = String(paymentStatus).toLowerCase();
    if (SETTLEMENT_STATUS_MAP[key]) {
      return SETTLEMENT_STATUS_MAP[key];
    }
  }
  if (!status) return 'pending';
  const key = String(status).toLowerCase();
  return SETTLEMENT_STATUS_MAP[key] || 'pending';
}

function pickNumber(source, keys, fallback = 0) {
  if (!source) return fallback;
  for (const key of keys) {
    if (key in source) {
      const value = toNumber(source[key], fallback);
      if (Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

function pickString(source, keys, fallback = '') {
  if (!source) return fallback;
  for (const key of keys) {
    if (key in source && source[key]) {
      return String(source[key]);
    }
  }
  return fallback;
}

async function getSiteConfig(supabase, siteId) {
  const { data, error } = await supabase
    .schema('public')
    .from('site_configs')
    .select('id, name, platform, display_name, domain, data_source, config_json')
    .eq('id', siteId)
    .limit(1);

  if (error) {
    throw new Error(`Supabase 查询站点配置失败：${error.message}`);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
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
  const missing = uniqueIds.filter(id => !found.has(id));

  if (!missing.length) return;

  const { data: configs, error: cfgError } = await supabase
    .schema('public')
    .from('site_configs')
    .select('id, name, display_name, platform, is_active')
    .in('id', missing);

  if (cfgError) {
    throw new Error(`Supabase 查询站点配置失败：${cfgError.message}`);
  }

  const rows = (configs || [])
    .filter(cfg => cfg?.id)
    .map(cfg => ({
      id: cfg.id,
      name: cfg.name || cfg.display_name || cfg.id,
      display_name: cfg.display_name || cfg.name || cfg.id,
      platform: cfg.platform || 'lazada',
      is_active: cfg.is_active !== undefined ? cfg.is_active : true
    }));

  if (!rows.length) {
    const err = new Error(`未找到以下站点，请先在站点管理中创建：${missing.join(', ')}`);
    err.code = 'SITE_NOT_FOUND';
    err.missingSites = missing;
    throw err;
  }

  const { error: upsertError } = await supabase
    .schema('public')
    .from('sites')
    .upsert(rows, { onConflict: 'id' });

  if (upsertError) {
    throw new Error(`Supabase 创建站点失败：${upsertError.message}`);
  }
}

function mapOrder(order, { siteId, platform = 'lazada' }) {
  const orderNo = pickString(order, ['order_number', 'order_id', 'order_sn']);
  const currency = pickString(order, ['currency', 'order_currency', 'pay_currency'], 'CNY');
  const shippingFee = pickNumber(order, ['shipping_fee', 'shipping_amount', 'shipping_fee_total']);
  const discount = pickNumber(order, ['voucher_platform', 'voucher', 'discount_total', 'seller_discount']);
  const tax = pickNumber(order, ['tax_amount', 'tax_total']);
  const total = pickNumber(order, ['paid_price', 'grand_total', 'total_amount', 'total_payment']);
  const subtotal = pickNumber(order, ['item_price', 'price', 'goods_total'], total + discount - shippingFee - tax);
  const costOfGoods = pickNumber(order, ['cost_of_goods', 'cost_total', 'seller_cost']);
  const logisticsCost = shippingFee;
  const status = normalizeStatus(order.order_status || order.status);
  const settlementStatus = normalizeSettlementStatus(order.order_status || order.status, order.payment_status || order.paymentStatus);
  const placedAt = coerceDate(order.created_at || order.created_time || order.created);
  const settlementDate = coerceDate(order.updated_at || order.delivered_at || order.finished_at || order.completed_at);
  const remark = {
    lazada_status: order.order_status || order.status || null,
    lazada_payment_status: order.payment_status || order.paymentStatus || null
  };

  return {
    order_no: orderNo,
    site_id: siteId,
    platform,
    channel: pickString(order, ['fulfillment_type', 'delivery_type', 'channel'], 'lazada'),
    status,
    settlement_status: settlementStatus,
    settlement_date: settlementDate ? settlementDate.slice(0, 10) : null,
    placed_at: placedAt,
    currency,
    subtotal: toCurrency(subtotal),
    discount: toCurrency(discount),
    shipping_fee: toCurrency(shippingFee),
    tax: toCurrency(tax),
    total: toCurrency(total || subtotal - discount + shippingFee + tax),
    cost_of_goods: toCurrency(costOfGoods),
    logistics_cost: toCurrency(logisticsCost),
    remark,
    customer_id: pickString(order, ['customer_id', 'buyer_id', 'customer_number'], null)
  };
}

function mapOrderItems(order, orderRow) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return [];

  return items.map(item => {
    const quantity = pickNumber(item, ['quantity', 'qty', 'number', 'amount'], 1);
    const unitPrice = toCurrency(pickNumber(item, ['item_price', 'item_amount', 'price', 'sku_price'], 0));
    const totalPrice = toCurrency(pickNumber(item, ['paid_price', 'total_price', 'total_amount'], unitPrice * quantity));
    const costPrice = toCurrency(pickNumber(item, ['cost', 'cost_price', 'purchase_price'], 0));

    return {
      order_no: orderRow.order_no,
      sku: pickString(item, ['sku', 'seller_sku', 'item_sku', 'sku_id']),
      product_name: pickString(item, ['name', 'product_name', 'item_name']),
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      cost_price: costPrice,
      product_image: pickString(item, ['product_main_image', 'product_image', 'image'], null)
    };
  });
}

async function fetchOrders({ fetchImpl, supabase, siteConfig, siteId, from, to }) {
  const access = await ensureAccessToken({ supabase, siteId, fetchImpl });
  const host = resolveApiHost(siteConfig);
  const orders = [];

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await callLazadaApi({
      fetchImpl,
      accessToken: access.accessToken,
      host,
      path: '/orders/get',
      params: {
        sort_direction: 'DESC',
        offset,
        limit: DEFAULT_PAGE_SIZE,
        created_after: from,
        created_before: to
      }
    });

    const list = response?.data?.orders || response?.data || [];
    if (Array.isArray(list)) {
      orders.push(...list);
    }

    const total = toNumber(response?.data?.count || response?.data?.total_count || list.length);
    offset += DEFAULT_PAGE_SIZE;
    hasMore = Array.isArray(list) && list.length === DEFAULT_PAGE_SIZE && offset < (total || Number.MAX_SAFE_INTEGER);

    if (!hasMore && response?.data?.has_more === true) {
      hasMore = true;
    }

    if (!hasMore && response?.data?.next_offset) {
      offset = toNumber(response.data.next_offset, offset);
      hasMore = offset > orders.length;
    }

    if (!hasMore) break;
  }

  for (const order of orders) {
    if (!Array.isArray(order?.items) || !order.items.length) {
      try {
        const itemResponse = await callLazadaApi({
          fetchImpl,
          accessToken: access.accessToken,
          host,
          path: '/order/items/get',
          params: { order_id: order.order_id || order.order_number || order.order_sn }
        });
        const items = itemResponse?.data || itemResponse?.result || [];
        if (Array.isArray(items) && items.length) {
          order.items = items;
        }
      } catch (err) {
        console.warn('[lazada] Failed to fetch order items', err.message);
      }
    }
  }

  return { orders, token: access };
}

async function persistOrders(supabase, orders, items) {
  if (!orders.length) return { orders: [], orderIdMap: new Map() };

  await ensureSitesExist(supabase, orders.map(order => order.site_id));

  const { data: upserted, error } = await supabase
    .schema('public')
    .from('orders')
    .upsert(orders, { onConflict: 'order_no' })
    .select();

  if (error) {
    throw new Error(`Supabase upsert Lazada 订单失败：${error.message}`);
  }

  const idMap = new Map();
  (upserted || []).forEach(order => {
    if (order?.order_no && order?.id) {
      idMap.set(order.order_no, order.id);
    }
  });

  const orderIds = Array.from(idMap.values());
  if (orderIds.length) {
    const { error: delError } = await supabase
      .schema('public')
      .from('order_items')
      .delete()
      .in('order_id', orderIds);

    if (delError) {
      throw new Error(`Supabase 清理旧订单明细失败：${delError.message}`);
    }
  }

  if (items.length) {
    const rows = items
      .map(item => {
        const orderId = idMap.get(item.order_no);
        if (!orderId) return null;
        const { order_no, ...rest } = item;
        return { ...rest, order_id: orderId };
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

  return { orders: upserted || [], orderIdMap: idMap };
}

async function queryOrders(supabase, { siteId, from, to, limit = 200 }) {
  let builder = supabase
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
      order_items (id, sku, product_name, quantity, unit_price, total_price, cost_price, product_image)
    `)
    .eq('platform', 'lazada')
    .eq('site_id', siteId)
    .order('placed_at', { ascending: false });

  if (from) builder = builder.gte('placed_at', from);
  if (to) builder = builder.lte('placed_at', to);
  if (limit) builder = builder.limit(limit);

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Supabase 查询 Lazada 订单失败：${error.message}`);
  }

  const orders = Array.isArray(data) ? data : [];

  const missingRelations = orders.filter(order => !Array.isArray(order.order_items));
  if (missingRelations.length) {
    const orderIds = missingRelations
      .map(order => order?.id)
      .filter(Boolean);

    if (orderIds.length) {
      const { data: items, error: itemsError } = await supabase
        .schema('public')
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      if (itemsError) {
        throw new Error(`Supabase 查询 Lazada 订单明细失败：${itemsError.message}`);
      }

      const grouped = new Map();
      (items || []).forEach(item => {
        const orderId = item.order_id;
        if (!grouped.has(orderId)) {
          grouped.set(orderId, []);
        }
        grouped.get(orderId).push(item);
      });

      orders.forEach(order => {
        if (!Array.isArray(order.order_items)) {
          order.order_items = grouped.get(order.id) || [];
        }
      });
    }
  }

  orders.forEach(order => {
    if (!Array.isArray(order.order_items)) {
      order.order_items = [];
    }
  });

  return orders;
}

async function syncLazadaOrders({
  fetchImpl,
  supabase,
  siteId,
  from,
  to,
  limit = 200,
  shouldSync = true
}) {
  if (!supabase) {
    throw new Error('Supabase client is required');
  }
  if (!siteId) {
    throw new Error('缺少 siteId 参数');
  }

  const { from: normalizedFrom, to: normalizedTo } = normalizeRange(from, to);
  const siteConfig = await getSiteConfig(supabase, siteId);
  if (!siteConfig) {
    const err = new Error(`未找到 Lazada 站点配置：${siteId}`);
    err.code = 'SITE_NOT_FOUND';
    err.missingSites = [siteId];
    throw err;
  }

  const summary = {
    fetched: 0,
    persisted: 0,
    siteId,
    range: { from: normalizedFrom, to: normalizedTo },
    tokenRefreshed: false
  };

  if (shouldSync) {
    const result = await fetchOrders({ fetchImpl, supabase, siteConfig, siteId, from: normalizedFrom, to: normalizedTo });
    summary.fetched = Array.isArray(result.orders) ? result.orders.length : 0;
    summary.tokenRefreshed = !!result.token?.expiresAt;

    const mappedOrders = [];
    const mappedItems = [];

    (result.orders || []).forEach(order => {
      const row = mapOrder(order, { siteId });
      if (!row.order_no) return;
      mappedOrders.push(row);
      const items = mapOrderItems(order, row);
      if (items.length) {
        mappedItems.push(...items);
      }
    });

    if (mappedOrders.length) {
      const persisted = await persistOrders(supabase, mappedOrders, mappedItems);
      summary.persisted = persisted.orders.length;
    }
  }

  const orders = await queryOrders(supabase, {
    siteId,
    from: normalizedFrom,
    to: normalizedTo,
    limit
  });

  return { orders, summary };
}

module.exports = {
  syncLazadaOrders,
  mapOrder,
  mapOrderItems,
  normalizeRange,
  getSiteConfig
};
