const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const idsParam = req.query.ids || '';
  const ids = idsParam.split(',').map(s=>s.trim()).filter(Boolean);
  if(!ids.length){
    return res.status(400).json({ error: 'Missing ids' });
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials are not configured' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const links = ids.map(id => `https://aliexpress.com/item/${id}.html`);
  const { data: existing } = await supabase
    .from('aliex_product')
    .select('product_link,title,image')
    .in('product_link', links);
  const result = {};
  if(existing){
    existing.forEach(r=>{
      const m = r.product_link.match(/(\d+)\.html/);
      const id = m ? m[1] : r.product_link;
      result[id] = { title: r.title || id, image: r.image || '' };
    });
  }
  const missing = ids.filter(id => !result[id]);
  await Promise.all(missing.map(async id => {
    const url = `https://aliexpress.com/item/${id}.html`;
    try {
      const resp = await fetch(url);
      const html = await resp.text();
      const $ = cheerio.load(html);
      let title = $('h1.product-title-text').first().text().trim();
      if (!title) title = $('meta[property="og:title"]').attr('content') || '';
      const image = $('meta[property="og:image"]').attr('content') || '';
      result[id] = { title: title || id, image };
      await supabase.from('aliex_product').insert({ product_link:url, title, image }).catch(()=>{});
    } catch (e) {
      result[id] = { title:id, image:'' };
    }
  }));
  res.status(200).json({ items: result });
};
