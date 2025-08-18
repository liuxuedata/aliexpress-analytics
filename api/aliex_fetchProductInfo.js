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

  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase =
    SUPABASE_URL && SUPABASE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false }
        })
      : null;

  try {
    // 1. Try to read cached record from aliex_product table if Supabase is configured
    if (supabase) {
      try {
        const { data: existing, error: selectError } = await supabase
          .from('aliex_product')
          .select('*')
          .eq('product_link', url)
          .single();
        if (!selectError && existing) {
          return res.status(200).json({
            title: existing.title || '',
            description: existing.description || '',
            image: existing.image || ''
          });
        }
      } catch (e) {
        // ignore cache read errors and fall through to fetch
      }
    }

    // 2. Not found or cache disabled – fetch and parse AliExpress page
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

    // 3. Insert new record into DB for caching if possible
    if (supabase) {
      supabase
        .from('aliex_product')
        .insert({
          product_link: url,
          title,
          description,
          image
        })
        .catch(() => {}); // ignore cache write errors
    }

    return res.status(200).json({ title, description, image });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};