const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

/**
 * Vercel serverless function to collect weekly Shopify statistics.
 *
 * Environment variables:
 *  - SUPABASE_URL, SUPABASE_KEY: Supabase credentials.
 *  - SHOPIFY_STORES: JSON string of [{"shop":"my-shop.myshopify.com","token":"shpat_xxx"}]
 *
 * The function fetches last week's orders for each store and inserts a
 * summary row into the `shopify_weekly_stats` table in Supabase.
 */
module.exports = async (req, res) => {
  const { SUPABASE_URL, SUPABASE_KEY, SHOPIFY_STORES } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials are not configured' });
  }
  if (!SHOPIFY_STORES) {
    return res.status(500).json({ error: 'SHOPIFY_STORES env var is missing' });
  }

  let stores;
  try {
    stores = JSON.parse(SHOPIFY_STORES);
  } catch (err) {
    return res.status(500).json({ error: 'Invalid SHOPIFY_STORES JSON' });
  }

  // Determine last week date range (from previous Monday to Sunday)
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0); // start of today (Monday when cron runs)
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const createdAtMin = start.toISOString();
  const createdAtMax = end.toISOString();

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  for (const store of stores) {
    const { shop, token } = store;
    if (!shop || !token) continue;

    try {
      const ordersUrl = `https://${shop}/admin/api/2023-07/orders.json?status=any&` +
        `created_at_min=${createdAtMin}&created_at_max=${createdAtMax}`;
      const response = await fetch(ordersUrl, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      if (!response.ok) {
        throw new Error(`Shopify API error ${response.status}`);
      }
      const data = await response.json();
      const orders = data.orders || [];
      const orderCount = orders.length;
      const totalSales = orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);

      const { error } = await supabase.from('shopify_weekly_stats').insert({
        store_name: shop,
        week_start: createdAtMin,
        week_end: createdAtMax,
        order_count: orderCount,
        total_sales: totalSales
      });
      if (error) {
        throw error;
      }
    } catch (err) {
      console.error(`Failed processing store ${shop}:`, err.message);
    }
  }

  return res.status(200).json({ message: 'Shopify weekly stats collected' });
};
