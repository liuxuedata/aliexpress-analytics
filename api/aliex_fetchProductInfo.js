const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

/**
 * API handler for Vercel to fetch AliExpress product details with caching.
 *
 * - Reads `SUPABASE_URL` and a Supabase key (`SUPABASE_SERVICE_ROLE_KEY`
 *   or `SUPABASE_ANON_KEY`) from environment variables.
 * - Uses Supabase table `aliex_product` to cache product data (link, title, description, image).
 * - If the product link already exists in the table, returns the cached record.
 * - Otherwise, fetches the AliExpress page, extracts title, description and image, stores them,
 *   and returns the data. Selectors may need adjustment if AliExpress page structure changes.
 *
 * Example usage: GET /api/fetchProductInfo?url=https://aliexpress.ru/item/1005009287200760.html
 */

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res
      .status(500)
      .json({ error: 'Supabase credentials are not configured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });

  try {
    // 1. Try to read cached record from aliex_product table
    const { data: existing, error: selectError } = await supabase
      .from('aliex_product')
      .select('*')
      .eq('product_link', url)
      .single();
    if (selectError && selectError.code !== 'PGRST116') {
      // Unexpected error (PGRST116 indicates no rows found)
      throw selectError;
    }
    if (existing) {
      return res.status(200).json({
        title: existing.title || '',
        description: existing.description || '',
        image: existing.image || ''
      });
    }

    // 2. Not found in DB – fetch and parse AliExpress page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    // Extract title: try specific selector, fallback to og:title meta
    let title = $('h1.product-title-text').first().text().trim();
    if (!title) {
      title = $('meta[property="og:title"]').attr('content') || '';
    }
    // Extract description: try description div; fallback to meta description
    let description = $('#description').text().trim();
    if (!description) {
      description = $('meta[name="description"]').attr('content') || '';
    }
    // Extract main image: use og:image meta as default
    const image = $('meta[property="og:image"]').attr('content') || '';

    // 3. Insert new record into DB for caching
    const { error: insertError } = await supabase.from('aliex_product').insert({
      product_link: url,
      title,
      description,
      image
    });
    if (insertError) {
      throw insertError;
    }

    return res.status(200).json({ title, description, image });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};