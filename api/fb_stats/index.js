// /api/fb_stats/index.js
const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  if (d && !isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return fallback;
}

module.exports = async (req, res) => {
  try {
    const supabase = getClient();
    const site = req.query.site_id || req.query.site || 'icyberite';
    const today = new Date();
    const defTo = today.toISOString().slice(0,10);
    const defFrom = new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    const from = parseDate(req.query.from, defFrom);
    const to = parseDate(req.query.to, defTo);

    let q = supabase
      .from('fact_meta_daily')
      .select('*')
      .eq('site_id', site)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok:false, error: error.message });
    const rows = data || [];

    const sum = (arr, k) => arr.reduce((s,r)=>s + Number(r[k]||0), 0);
    const impressions = sum(rows,'impressions');
    const clicks = sum(rows,'link_clicks');
    const conversions = sum(rows,'purchase_web');
    const kpis = {
      avg_ctr: impressions>0 ? clicks/impressions*100 : 0,
      avg_conv_rate: clicks>0 ? conversions/clicks*100 : 0,
      exposure_product_count: new Set(rows.filter(r=>r.impressions>0).map(r=>r.product_identifier)).size,
      click_product_count: new Set(rows.filter(r=>r.link_clicks>0).map(r=>r.product_identifier)).size,
      conversion_product_count: new Set(rows.filter(r=>r.purchase_web>0).map(r=>r.product_identifier)).size,
      new_product_count: 0
    };

    return res.json({ ok:true, table: rows, kpis });
  } catch (e) {
    console.error('fb_stats error', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
};
