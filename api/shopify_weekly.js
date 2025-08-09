const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

/**
 * Vercel serverless function to collect weekly Shopify analytics by country,
 * time range and product.
 *
 * Environment variables:
 *  - SUPABASE_URL, SUPABASE_KEY: Supabase credentials.
 *  - SHOPIFY_STORES: JSON string of
 *      [{"shop":"my-shop.myshopify.com","token":"shpat_xxx"}]
 *    where `shop` is the shop domain and `token` is the private API access key.
 */
module.exports = async (req, res) => {
  const { SUPABASE_URL, SUPABASE_KEY, SHOPIFY_STORES } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY || !SHOPIFY_STORES) {
    return res.status(500).json({ error: 'Missing required environment variables' });
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
  const rangeStart = start.toISOString();
  const rangeEnd = end.toISOString();

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  for (const store of stores) {
    const { shop, token } = store;
    if (!shop || !token) continue;

    try {
      const analytics = await fetchAnalytics(shop, token, rangeStart, rangeEnd);
      if (analytics.length) {
        const rows = analytics.map((row) => ({
          store_name: shop,
          week_start: rangeStart,
          week_end: rangeEnd,
          country: row.country,
          source: row.source,
          product_title: row.productTitle,
          product_url: row.productUrl,
          visits: row.visits
        }));
        const { error } = await supabase
          .from('shopify_weekly_stats')
          .insert(rows);
        if (error) {
          throw error;
        }
      }
    } catch (err) {
      console.error(`Failed processing store ${shop}:`, err.message);
    }
  }

  return res.status(200).json({ message: 'Shopify weekly analytics collected' });
};

/**
 * Fetch session analytics for the given Shopify store via the GraphQL
 * Analytics API. Returned rows contain country, source channel, visited
 * product and landing page information with visit counts.
 */
async function fetchAnalytics(shop, token, start, end) {
  const query = `
    query Sessions($start: DateTime!, $end: DateTime!) {
      shopifyqlQuery(
        query: "FROM sessions SELECT country, source, landing_page, product_title, product_url, count() AS visits WHERE started_at >= $start AND started_at < $end GROUP BY country, source, landing_page, product_title, product_url"
      ) {
        __typename
        ... on Table {
          columns { name }
          rows
        }
      }
    }
  `;
  const response = await fetch(`https://${shop}/admin/api/2023-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { start, end } })
  });
  if (!response.ok) {
    throw new Error(`Shopify analytics API error ${response.status}`);
  }
  const json = await response.json();
  const table = json.data && json.data.shopifyqlQuery;
  if (!table || table.__typename !== 'Table') return [];

  const colIndex = {};
  table.columns.forEach((c, i) => (colIndex[c.name] = i));
  return table.rows.map((row) => ({
    country: row[colIndex.country] || null,
    source: row[colIndex.source] || null,
    productTitle: row[colIndex.product_title] || null,
    productUrl: row[colIndex.product_url] || null,
    visits: parseInt(row[colIndex.visits] || '0', 10)
  }));
}
