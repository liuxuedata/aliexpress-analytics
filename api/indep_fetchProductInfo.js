const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

/**
 * Fetch product metadata for independent sites with caching.
 * Stores records in `indep_product` table (product_link, title, image).
 */
module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Check cache
    const { data: existing, error: selErr } = await supabase
      .from('indep_product')
      .select('*')
      .eq('product_link', url)
      .single();
    if (selErr && selErr.code !== 'PGRST116') throw selErr;
    if (existing) {
      return res.status(200).json({ title: existing.title || '', image: existing.image || '' });
    }

    // Fetch page
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const image = $('meta[property="og:image"]').attr('content') || '';

    // Cache
    const { error: insErr } = await supabase.from('indep_product').insert({
      product_link: url,
      title,
      image
    });
    if (insErr) throw insErr;

    return res.status(200).json({ title, image });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
