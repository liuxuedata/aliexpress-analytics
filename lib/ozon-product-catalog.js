'use strict';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const metadataCache = new Map();

function normalizeSku(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeTableName(name, fallback = 'ozon_product_report_wide') {
  let table = (name || fallback).trim();
  table = table.replace(/^"+|"+$/g, '');
  table = table.replace(/^public\./i, '');
  return table || fallback;
}

function extractPrimaryImage(product) {
  if (!product || typeof product !== 'object') return null;
  if (product.primary_image) return product.primary_image;
  if (product.primary_image_url) return product.primary_image_url;
  if (product.main_image) return product.main_image;
  if (product.image) return product.image;
  if (Array.isArray(product.images) && product.images.length) {
    const preferred = product.images.find(img => img && (img.default === true || img.is_default === true));
    const candidate = preferred || product.images[0];
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') {
      return candidate.url || candidate.image_url || candidate.file_name || candidate.file || candidate.src || null;
    }
  }
  if (Array.isArray(product.picture)) {
    const candidate = product.picture.find(Boolean) || product.picture[0];
    if (typeof candidate === 'string') return candidate;
  }
  if (Array.isArray(product.image_list)) {
    const candidate = product.image_list.find(Boolean) || product.image_list[0];
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate === 'object') {
      return candidate.url || candidate.image_url || candidate.file_name || null;
    }
  }
  return null;
}

async function fetchFromCatalog({ supabase, tableName, skus }) {
  if (!supabase || !Array.isArray(skus) || !skus.length) {
    return new Map();
  }

  const table = normalizeTableName(tableName || process.env.OZON_TABLE_NAME || 'ozon_product_report_wide');
  const map = new Map();
  const chunkSize = 100;

  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    try {
      const { data, error } = await supabase
        .schema('public')
        .from(table)
        .select('sku,tovary,model')
        .in('sku', chunk);

      if (error) {
        throw new Error(error.message);
      }

      (data || []).forEach(row => {
        const sku = normalizeSku(row?.sku);
        if (!sku || map.has(sku)) return;
        map.set(sku, {
          name: row?.tovary || null,
          model: row?.model || null,
          image: null
        });
      });
    } catch (error) {
      console.warn('[ozon] Failed to read catalog metadata:', error.message);
      break;
    }
  }

  return map;
}

async function fetchFromApi({ fetchImpl, creds, skus, parseOzonResponse }) {
  if (!fetchImpl || !creds || !skus.length) {
    return new Map();
  }

  const endpoint = 'https://api-seller.ozon.ru/v2/product/info/list';
  const results = new Map();
  const chunkSize = 100;

  for (let i = 0; i < skus.length; i += chunkSize) {
    const batch = skus.slice(i, i + chunkSize);
    const payload = {
      offer_id: batch,
      product_id: [],
      sku: []
    };

    try {
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
        console.warn(`[ozon] Product info request failed (${response.status}):`, text.slice(0, 120));
        continue;
      }

      const parsed = typeof parseOzonResponse === 'function'
        ? parseOzonResponse(text, 'product_info')
        : JSON.parse(text);

      const list = Array.isArray(parsed?.result?.items)
        ? parsed.result.items
        : Array.isArray(parsed?.result)
          ? parsed.result
          : [];

      list.forEach(entry => {
        const sku = normalizeSku(entry?.offer_id || entry?.sku || entry?.id);
        if (!sku || results.has(sku)) return;
        const name = entry?.name || entry?.title || entry?.offer_id || sku;
        const image = extractPrimaryImage(entry);
        results.set(sku, { name, image: image || null });
      });
    } catch (error) {
      console.warn('[ozon] Failed to fetch product metadata:', error.message);
    }
  }

  return results;
}

function mergeMetadata(base, extra) {
  const map = new Map(base ? Array.from(base.entries()) : []);
  if (!extra) return map;
  extra.forEach((value, key) => {
    const current = map.get(key) || {};
    map.set(key, {
      name: value?.name || current.name || null,
      image: value?.image || current.image || null,
      model: value?.model || current.model || null
    });
  });
  return map;
}

async function fetchProductMetadata({ supabase, fetchImpl, creds, parseOzonResponse, tableName, skus }) {
  const normalized = Array.from(new Set((skus || []).map(normalizeSku).filter(Boolean)));
  if (!normalized.length) {
    return new Map();
  }

  const now = Date.now();
  const result = new Map();
  const missing = [];

  normalized.forEach(sku => {
    const cached = metadataCache.get(sku);
    if (cached && cached.expiresAt > now) {
      result.set(sku, { ...cached.value });
    } else {
      missing.push(sku);
    }
  });

  if (!missing.length) {
    return result;
  }

  let catalogMap = new Map();
  try {
    catalogMap = await fetchFromCatalog({ supabase, tableName, skus: missing });
  } catch (error) {
    console.warn('[ozon] Catalog lookup failed:', error.message);
  }

  let apiMap = new Map();
  try {
    apiMap = await fetchFromApi({ fetchImpl, creds, skus: missing, parseOzonResponse });
  } catch (error) {
    console.warn('[ozon] Product API lookup failed:', error.message);
  }

  const merged = mergeMetadata(catalogMap, apiMap);

  merged.forEach((value, key) => {
    const copy = { ...value };
    result.set(key, copy);
    metadataCache.set(key, { value: copy, expiresAt: now + CACHE_TTL_MS });
  });

  // Ensure entries that had catalog but not API are cached as well
  catalogMap.forEach((value, key) => {
    if (!result.has(key)) {
      const copy = { ...value };
      result.set(key, copy);
      metadataCache.set(key, { value: copy, expiresAt: now + CACHE_TTL_MS });
    }
  });

  return result;
}

function applyMetadataToItems(items, metadataMap) {
  if (!Array.isArray(items) || !items.length) return items || [];
  const map = metadataMap || new Map();

  return items.map(item => {
    const sku = normalizeSku(item?.sku);
    const meta = sku ? map.get(sku) : null;
    const baseName = item?.product_name && String(item.product_name).trim()
      ? String(item.product_name).trim()
      : null;
    const resolvedName = baseName || meta?.name || sku || null;
    const image = meta?.image || item?.product_image || null;

    return {
      ...item,
      product_name: resolvedName || item?.product_name || sku || '商品',
      product_image: image || null
    };
  });
}

function createProductMetadataLoader({ supabase, fetchImpl, creds, parseOzonResponse, tableName } = {}) {
  return async function loadProductMetadata(skus) {
    return fetchProductMetadata({
      supabase,
      fetchImpl,
      creds,
      parseOzonResponse,
      tableName,
      skus
    });
  };
}

async function enrichOrdersWithCatalog({ orders, metadataLoader, prefetchedMetadata }) {
  if (!Array.isArray(orders) || !orders.length) return orders || [];
  const baseMap = new Map();
  if (prefetchedMetadata instanceof Map) {
    prefetchedMetadata.forEach((value, key) => {
      baseMap.set(key, { ...value });
    });
  }

  const missing = new Set();
  orders.forEach(order => {
    const items = Array.isArray(order?.order_items) ? order.order_items : [];
    items.forEach(item => {
      const sku = normalizeSku(item?.sku);
      if (!sku) return;
      if (!baseMap.has(sku)) {
        missing.add(sku);
      }
    });
  });

  if (missing.size && typeof metadataLoader === 'function') {
    try {
      const loaded = await metadataLoader(Array.from(missing));
      if (loaded instanceof Map) {
        loaded.forEach((value, key) => {
          if (!baseMap.has(key)) {
            baseMap.set(key, { ...value });
          }
        });
      }
    } catch (error) {
      console.warn('[ozon] Failed to enrich orders with metadata:', error.message);
    }
  }

  return orders.map(order => {
    const items = Array.isArray(order?.order_items) ? order.order_items : [];
    const enrichedItems = applyMetadataToItems(items, baseMap);
    return {
      ...order,
      order_items: enrichedItems
    };
  });
}

module.exports = {
  normalizeSku,
  createProductMetadataLoader,
  fetchProductMetadata,
  applyMetadataToItems,
  enrichOrdersWithCatalog
};
