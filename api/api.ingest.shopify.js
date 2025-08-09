
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SHOP = process.env.SHOPIFY_SHOP;                 // e.g. mystore.myshopify.com
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;        // Admin API access token
const API_VER = process.env.SHOPIFY_API_VERSION || '2024-04'; // adjust if needed

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// helper: ISO date range for a given YYYY-MM-DD in UTC
function dayRange(dateStr) {
  // Use UTC 00:00:00 to 23:59:59 as a safe default.
  const start = new Date(dateStr + 'T00:00:00.000Z');
  const end = new Date(dateStr + 'T23:59:59.999Z');
  return { start: start.toISOString(), end: end.toISOString() };
}

// Fetch all orders within date range using cursor pagination
async function fetchOrdersInRange(startISO, endISO) {
  let url = `https://${SHOP}/admin/api/${API_VER}/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=250&fields=id,created_at,currency,customer,line_items`;
  const orders = [];
  while (url) {
    const resp = await fetch(url, { headers: { 'X-Shopify-Access-Token': TOKEN } });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Shopify API error: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    orders.push(...(data.orders || []));

    // Pagination via Link header
    const link = resp.headers.get('link');
    if (link && link.includes('rel="next"')) {
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      url = m ? m[1] : null;
    } else {
      url = null;
    }
  }
  return orders;
}

export default async function handler(req, res) {
  try {
    if (!SHOP || !TOKEN) {
      res.status(500).json({ error: 'Missing SHOPIFY_SHOP or SHOPIFY_ACCESS_TOKEN env' });
      return;
    }
    const date = (req.query.date || '').trim() || new Date(Date.now() - 24*3600*1000).toISOString().slice(0,10); // default: yesterday (UTC)
    const { start, end } = dayRange(date);

    const orders = await fetchOrdersInRange(start, end);

    // Aggregate per product_id
    const byProduct = new Map();
    for (const o of orders) {
      const orderId = o.id;
      const customerId = o.customer && o.customer.id;
      for (const li of (o.line_items || [])) {
        const pid = li.product_id;
        if (!pid) continue; // skip custom items
        const key = String(pid);
        if (!byProduct.has(key)) {
          byProduct.set(key, {
            product_id: key,
            pay_items: 0,
            pay_orders_set: new Set(),
            pay_buyers_set: new Set(),
            revenue: 0,
          });
        }
        const acc = byProduct.get(key);
        const qty = Number(li.quantity || 0);
        acc.pay_items += qty;
        acc.pay_orders_set.add(orderId);
        if (customerId) acc.pay_buyers_set.add(customerId);
        // revenue: line price * qty
        const unit = (li.price && Number(li.price)) || 0;
        acc.revenue += unit * qty;
      }
    }

    const rows = [];
    for (const [_, acc] of byProduct) {
      rows.push({
        source_code: 'SHOPIFY',
        platform: 'shopify',
        stat_date: date,
        product_id: acc.product_id,
        exposure: 0,
        visitors: 0,
        views: 0,
        add_people: 0,
        add_count: 0,
        pay_items: acc.pay_items,
        pay_orders: acc.pay_orders_set.size,
        pay_buyers: acc.pay_buyers_set.size,
        visitor_to_add: 0,
        add_to_pay: 0,
        visitor_ratio: 0,
        revenue: acc.revenue,
        raw: null
      });
    }

    if (rows.length) {
      const { error } = await supabase
        .from('fact_daily_metrics')
        .upsert(rows, { onConflict: 'source_code,platform,product_id,stat_date' });
      if (error) throw error;
    }

    res.status(200).json({ success: true, date, products: rows.length, orders: orders.length });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
}
