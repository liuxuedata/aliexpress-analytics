// /api/independent/ingest/index.js
// Upload Google Ads Landing Pages export (xlsx or csv) and upsert into Supabase
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY (insert allowed by RLS)
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable').default;
const fs = require('fs');
const XLSX = require('xlsx');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseUrlParts(u) {
  try {
    const url = new URL(u);
    return { site: url.hostname.replace(/^www\./, ''), path: url.pathname || '/' };
  } catch(e) {
    return { site: 'unknown', path: u || '/' };
  }
}

function coerceNum(x) {
  if (x === null || x === undefined || x === '' || x === '--') return 0;
  let s = String(x).trim();
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Normalize assorted date representations to a Date in UTC.
function parseDay(dayRaw) {
  if (dayRaw === null || dayRaw === undefined || dayRaw === '') return null;

  if (typeof dayRaw === 'number') {
    const s = String(dayRaw);
    // Handle numbers shaped like 20250818 (YYYYMMDD)
    if (/^\d{8}$/.test(s)) {
      return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    }
    // Otherwise assume an Excel serial date
    const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    return null;
  }

  const s = String(dayRaw).trim();
  // Support "YYYY/M/D" or "YYYY-M-D"
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  // Plain 8-digit string
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Parse and upsert Meta/Facebook ads export into dedicated tables
async function handleFacebookFile(filePath, filename, site = 'icyberite') {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (!rows.length) return { processed: 0, upserted: 0 };

  const header = rows[0];
  const dataRows = rows.slice(1);

  const canon = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\.\-_\/()（）]+/g, '');
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cDate = col('date', 'day', 'reportdate', 'report_start');
  const cLevel = col('level');
  const cCampaignId = col('campaignid', 'campaign_id');
  const cCampaignName = col('campaignname');
  const cAdsetId = col('adsetid', 'adset_id');
  const cAdsetName = col('adsetname');
  const cAdId = col('adid', 'ad_id');
  const cAdName = col('adname');
  const cCurrency = col('currency', 'currencycode');
  const cSpend = col('spend', 'amountspent');
  const cReach = col('reach');
  const cImpr = col('impressions');
  const cFreq = col('frequency');
  const cLinkClicks = col('linkclicks');
  const cAllClicks = col('clicks', 'allclicks');
  const cLinkCtr = col('linkctr', 'linkclickthroughrate');
  const cCtr = col('ctr', 'clickthroughrate');
  const cCpc = col('cpclink', 'cpc');
  const cCpm = col('cpm');
  const cAtcWeb = col('atcweb', 'websiteaddtocart', 'adds to cart (website)');
  const cIcWeb = col('icweb', 'websitecheckout', 'initiate checkout (website)');
  const cPurchaseWeb = col('purchaseweb', 'websitepurchases');
  const cProductId = col('productid', 'contentid');
  const cProductTitle = col('producttitle');
  const cLanding = col('landingurl', 'url');
  const cCreative = col('creativename');

  const supabase = getClient();
  const rawRows = [];
  const factRows = [];
  const campaignMap = new Map();
  const adsetMap = new Map();
  const adMap = new Map();

  for (const r of dataRows) {
    if (!r || !r.length) continue;
    const rowObj = {};
    header.forEach((h, i) => { rowObj[h] = r[i]; });
    rawRows.push({ site_id: site, channel_id: 'meta_ads', row_data: rowObj });

    const day = parseDay(r[cDate]);
    if (!day) continue;
    const report_date = day.toISOString().slice(0,10);
    const level = cLevel >= 0 ? String(r[cLevel] || '').trim().toLowerCase() : 'ad';
    const campaign_id = cCampaignId >= 0 ? String(r[cCampaignId] || '').trim() : null;
    const adset_id = cAdsetId >= 0 ? String(r[cAdsetId] || '').trim() : null;
    const ad_id = cAdId >= 0 ? String(r[cAdId] || '').trim() : null;
    if (campaign_id && !campaignMap.has(campaign_id)) {
      campaignMap.set(campaign_id, { campaign_id, site_id: site, campaign_name: cCampaignName>=0?String(r[cCampaignName]||'').trim():null });
    }
    if (adset_id && !adsetMap.has(adset_id)) {
      adsetMap.set(adset_id, { adset_id, site_id: site, campaign_id, adset_name: cAdsetName>=0?String(r[cAdsetName]||'').trim():null });
    }
    if (ad_id && !adMap.has(ad_id)) {
      adMap.set(ad_id, { ad_id, site_id: site, adset_id, ad_name: cAdName>=0?String(r[cAdName]||'').trim():null });
    }

    factRows.push({
      site_id: site,
      channel_id: 'meta_ads',
      level,
      campaign_id,
      adset_id,
      ad_id,
      report_date,
      currency_code: cCurrency>=0?String(r[cCurrency]||'').trim():null,
      spend_usd: cSpend>=0?coerceNum(r[cSpend]):null,
      reach: cReach>=0?coerceNum(r[cReach]):null,
      impressions: cImpr>=0?coerceNum(r[cImpr]):null,
      frequency: cFreq>=0?coerceNum(r[cFreq]):null,
      link_clicks: cLinkClicks>=0?coerceNum(r[cLinkClicks]):null,
      all_clicks: cAllClicks>=0?coerceNum(r[cAllClicks]):null,
      link_ctr: cLinkCtr>=0?coerceNum(r[cLinkCtr]):null,
      all_ctr: cCtr>=0?coerceNum(r[cCtr]):null,
      cpc_link: cCpc>=0?coerceNum(r[cCpc]):null,
      cpm: cCpm>=0?coerceNum(r[cCpm]):null,
      atc_web: cAtcWeb>=0?coerceNum(r[cAtcWeb]):null,
      ic_web: cIcWeb>=0?coerceNum(r[cIcWeb]):null,
      purchase_web: cPurchaseWeb>=0?coerceNum(r[cPurchaseWeb]):null,
      product_identifier: cProductId>=0?String(r[cProductId]||'').trim():null,
      product_title_guess: cProductTitle>=0?String(r[cProductTitle]||'').trim():null,
      landing_url: cLanding>=0?String(r[cLanding]||'').trim():null,
      creative_name: cCreative>=0?String(r[cCreative]||'').trim():null
    });
  }

  if (!rawRows.length) return { processed: 0, upserted: 0 };

  async function refreshSchema() {
    const { error } = await supabase.rpc('refresh_meta_schema_cache');
    if (error) console.error('schema cache refresh failed:', error.message);
    await new Promise(r => setTimeout(r, 1000));
  }

  let error;
  for (let attempt=0; attempt<2; attempt++) {
    ({ error } = await supabase.from('fb_raw').insert(rawRows));
    if (!error) break;
    if (/schema cache/i.test(error.message)) { await refreshSchema(); continue; }
    throw error;
  }
  if (error) throw error;

  const campaignRows = Array.from(campaignMap.values());
  if (campaignRows.length) {
    await supabase.from('meta_campaign').upsert(campaignRows, { onConflict: 'campaign_id' });
  }
  const adsetRows = Array.from(adsetMap.values());
  if (adsetRows.length) {
    await supabase.from('meta_adset').upsert(adsetRows, { onConflict: 'adset_id' });
  }
  const adRows = Array.from(adMap.values());
  if (adRows.length) {
    await supabase.from('meta_ad').upsert(adRows, { onConflict: 'ad_id' });
  }

  let data;
  for (let attempt=0; attempt<2; attempt++) {
    ({ data, error } = await supabase
      .from('fact_meta_daily')
      .upsert(factRows, { onConflict: 'site_id,channel_id,report_date,level,campaign_id,adset_id,ad_id' }));
    if (!error) break;
    if (/schema cache/i.test(error.message)) { await refreshSchema(); continue; }
    throw error;
  }
  if (error) throw error;

  return { processed: dataRows.length, upserted: data?.length ?? factRows.length };
}

async function handleFile(filePath, filename, source = '') {
  const ext = (filename || '').toLowerCase();
  let rows = [];

  if (ext.endsWith('.csv')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const wb = XLSX.read(raw, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  } else {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]]; // "Landing pages"
    rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  }

  // Find header row (contains "Landing page"/"URL"/"网址", etc.)
  let headerIdx = rows.findIndex(r => (r||[]).some(c => {
    const cell = String(c||'').trim().toLowerCase();
    return (
      cell === 'landing page' ||
      cell === 'url' ||
      cell === 'website url' ||
      cell === '网址' ||
      cell.includes('链接（广告设置）') ||
      cell.includes('链接(广告设置)')
    );
  }));
  if (headerIdx === -1) throw new Error('Header row not found. Make sure the sheet has a "Landing page" or "URL" column.');
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  // Build a case-insensitive header lookup tolerant of punctuation and spacing.
  // Allow non-Latin characters (e.g., Chinese) to remain for matching.
  const canon = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\.\-_\/()（）]+/g, '');
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cLanding = col(
    'landing page',
    'url',
    'website url',
    '网址',
    '链接（广告设置）',
    '链接(广告设置)',
    '链接'
  );
  const cCampaign = col('campaign', 'campaign name', '广告系列名称');
  const cDay = col('day', 'date', '报告开始日期', '开始日期');
  const cNetwork = col(
    'network (with search partners)',
    'network',
    'source',
    'platform'
  );
  const cDevice = col('device', 'device type', '设备');
  const cClicks = col('clicks', 'link clicks', '链接点击量');
  const cImpr = col('impr.', 'impressions', '展示次数');
  const cCTR = col('ctr', 'click-through rate', '点击率（全部）', '链接点击率');
  const cAvgCPC = col('avg. cpc', 'cpc', 'cost per click', '单次链接点击费用');
  const cCost = col('cost', 'amount spent', '已花费金额usd', '已花费金额');
  const cConv = col('conversions', 'results', 'purchases', '成效', '网站购物');
  const cCostPerConv = col(
    'cost / conv.',
    'cost/conv.',
    'cost/conv',
    'cost per result',
    'avg. cost',
    '单次成效费用'
  );
  const cAllConv = col('all conv.', 'all conv', 'total conv');
  const cConvValue = col('conv. value', 'conv value', 'purchase value');
  const cAllConvRate = col('all conv. rate', 'all conv rate', 'total conv rate');
  const cConvRate = col('conv. rate', 'conv rate', 'conversion rate');
  const cCurrency = col('currency code', 'currency');

  const payload = [];
  for (const r of dataRows) {
    const landing = r[cLanding];
    if (!landing || landing === 'Total') continue;
    const dayRaw = r[cDay];
    const day = parseDay(dayRaw);
    if (!day) continue;

    const { site, path } = parseUrlParts(String(landing).trim());

    payload.push({
      site,
      landing_url: String(landing).trim(),
      landing_path: path,
      campaign: String(r[cCampaign] || '').trim(),
      day: day.toISOString().slice(0,10),
      network: cNetwork >= 0 ? String(r[cNetwork] || '').trim() : String(source || '').trim(),
      device: String(r[cDevice] || '').trim(),
      currency_code: cCurrency >= 0 ? String(r[cCurrency] || '').trim() : null,
      clicks: cClicks >= 0 ? coerceNum(r[cClicks]) : 0,
      impr: cImpr >= 0 ? coerceNum(r[cImpr]) : 0,
      ctr: cCTR >= 0 ? coerceNum(r[cCTR]) : 0,
      avg_cpc: cAvgCPC >= 0 ? coerceNum(r[cAvgCPC]) : 0,
      cost: cCost >= 0 ? coerceNum(r[cCost]) : 0,
      conversions: cConv >= 0 ? coerceNum(r[cConv]) : 0,
      cost_per_conv: cCostPerConv >= 0 ? coerceNum(r[cCostPerConv]) : null,
      all_conv: cAllConv >= 0 ? coerceNum(r[cAllConv]) : null,
      conv_value: cConvValue >= 0 ? coerceNum(r[cConvValue]) : null,
      all_conv_rate: cAllConvRate >= 0 ? coerceNum(r[cAllConvRate]) : null,
      conv_rate: cConvRate >= 0 ? coerceNum(r[cConvRate]) : null
    });
  }

    if (!payload.length) return { processed: 0, upserted: 0 };

  // Deduplicate rows that target the same primary key to avoid
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" errors
  const byKey = new Map();
  for (const row of payload) {
    const key = [row.day, row.site, row.landing_path, row.device, row.network, row.campaign].join('|');
    if (!byKey.has(key)) {
      byKey.set(key, row);
    } else {
      // Merge metrics for duplicate keys so later rows don't overwrite
      // earlier ones with zeros. Additive fields are summed and derived
      // rates are recomputed from the aggregated values.
      const prev = byKey.get(key);
      const add = f => {
        const a = prev[f] == null ? 0 : prev[f];
        const b = row[f] == null ? 0 : row[f];
        prev[f] = a + b;
      };
      ['clicks', 'impr', 'cost', 'conversions', 'all_conv', 'conv_value'].forEach(add);

      prev.avg_cpc = prev.clicks ? prev.cost / prev.clicks : prev.avg_cpc;
      prev.ctr = prev.impr ? (prev.clicks / prev.impr) * 100 : prev.ctr;
      prev.cost_per_conv = prev.conversions ? prev.cost / prev.conversions : prev.cost_per_conv;
      prev.conv_rate = prev.clicks ? (prev.conversions / prev.clicks) * 100 : prev.conv_rate;
      prev.all_conv_rate = prev.clicks ? (prev.all_conv / prev.clicks) * 100 : prev.all_conv_rate;
    }
  }
  const deduped = Array.from(byKey.values());
  const supabase = getClient();

  async function refreshSchema() {
    const { error } = await supabase.rpc('refresh_independent_schema_cache');
    if (error) console.error('schema cache refresh failed:', error.message);
    await new Promise(r => setTimeout(r, 1000));
  }

  let data, error;
  for (let attempt = 0; attempt < 2; attempt++) {
    ({ data, error } = await supabase
      .from('independent_landing_metrics')
      .upsert(deduped, { onConflict: 'day,site,landing_path,device,network,campaign' }));
    if (!error) break;
    if (/schema cache/i.test(error.message)) { await refreshSchema(); continue; }
    throw error;
  }
  if (error) throw error;

  // Track first_seen_date for each landing_path per site.
  // Sort rows chronologically and compare each day with historical products
  // so a path is recorded the first time it ever appears.
  deduped.sort((a, b) => a.day.localeCompare(b.day));

  // Build list of paths to check existing first_seen records
  function groupBySite(rows) {
    const groups = new Map();
    rows.forEach(({ site, landing_path }) => {
      if (!groups.has(site)) groups.set(site, new Set());
      groups.get(site).add(landing_path);
    });
    return groups;
  }

  const existSet = new Set();
  const grouped = groupBySite(deduped);
  const MAX_QUERY_BYTES = 1900;
  for (const [site, paths] of grouped.entries()) {
    let batch = [];
    let length = 0;
    async function fetchExisting() {
      if (!batch.length) return;
      const { data: existed, error: e1 } = await supabase
        .from('independent_first_seen')
        .select('landing_path')
        .eq('site', site)
        .in('landing_path', batch);
      if (e1) {
        if (e1.code === '42P01') {
          throw new Error(
            "Table 'independent_first_seen' is missing in the database; run the required migration and retry."
          );
        }
        throw e1;
      }
      (existed || []).forEach(r => existSet.add(`${site}|${r.landing_path}`));
    }
    for (const p of paths.values()) {
      const enc = encodeURIComponent(p);
      if (batch.length && length + enc.length + 1 > MAX_QUERY_BYTES) {
        await fetchExisting();
        batch = [];
        length = 0;
      }
      batch.push(p);
      length += enc.length + 1;
    }
    await fetchExisting();
  }

  // Iterate rows in order, inserting first appearances only
  const seen = new Set(existSet);
  const insertRows = [];
  for (const row of deduped) {
    const key = `${row.site}|${row.landing_path}`;
    if (seen.has(key)) continue;
    insertRows.push({ site: row.site, landing_path: row.landing_path, first_seen_date: row.day });
    seen.add(key);
  }
  if (insertRows.length) {
    const { error: e2 } = await supabase
      .from('independent_first_seen')
      .insert(insertRows);
    if (e2) {
      if (e2.code === '42P01') {
        throw new Error(
          "Table 'independent_first_seen' is missing in the database; run the required migration and retry."
        );
      }
      throw e2;
    }
  }

  return {
    processed: payload.length,
    upserted: data?.length ?? deduped.length,
    new_products: insertRows.length,
    count: payload.length,
  };
}

async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).end(`<!doctype html><html><body>
      <form method="POST" enctype="multipart/form-data">
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </form>
    </body></html>`);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST with multipart/form-data (file field: file)' });
    return;
  }

  const form = formidable({ multiples: false, keepExtensions: true });
  try {
    const source = (req.query && req.query.source ? String(req.query.source) : '').toLowerCase();
    const site = (req.query && req.query.site ? String(req.query.site) : 'icyberite');
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err); else resolve({ fields, files });
      });
    });
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw new Error('No file uploaded. Use form-data field name "file".');
    const filePath = uploaded.filepath || uploaded.path;
    if (!filePath) throw new Error('Upload failed: file path missing.');
    if (source === 'facebook' || source === 'fb' || source === 'meta') {
      const result = await handleFacebookFile(
        filePath,
        uploaded.originalFilename || uploaded.newFilename || uploaded.name,
        site
      );
      res.status(200).json({ ok: true, ...result });
    } else {
      const result = await handleFile(
        filePath,
        uploaded.originalFilename || uploaded.newFilename || uploaded.name,
        source
      );
      res.status(200).json({ ok: true, ...result });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

handler.config = {
  api: {
    bodyParser: false, // we'll parse multipart manually
  },
};
module.exports = handler;
// expose for tests
module.exports._parseDay = parseDay;

