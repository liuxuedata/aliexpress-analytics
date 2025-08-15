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
  const n = Number(String(x).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function handleFile(filePath, filename) {
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

  // Find header row (contains "Landing page"/"URL", "Campaign", "Day", etc.)
  let headerIdx = rows.findIndex(r => (r||[]).some(c => {
    const cell = String(c||'').trim().toLowerCase();
    return cell === 'landing page' || cell === 'url' || cell === 'website url';
  }));
  if (headerIdx === -1) throw new Error('Header row not found. Make sure the sheet has a "Landing page" or "URL" column.');
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  // Build a case-insensitive header lookup so "Conversions" or "conversions"
  // (or other locale variations) are detected even if the exact casing differs
  const headerLC = header.map(h => String(h || '').trim().toLowerCase());
  const col = (...names) => {
    for (const n of names) {
      const idx = headerLC.indexOf(String(n).toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cLanding = col('landing page', 'url', 'website url');
  const cCampaign = col('campaign', 'campaign name');
  const cDay = col('day', 'date');
  const cNetwork = col('network (with search partners)', 'network', 'source', 'platform');
  const cDevice = col('device', 'device type');
  const cClicks = col('clicks', 'link clicks');
  const cImpr = col('impr.', 'impressions');
  const cCTR = col('ctr', 'click-through rate');
  const cAvgCPC = col('avg. cpc', 'cpc', 'cost per click');
  const cCost = col('cost', 'amount spent');
  const cConv = col('conversions', 'results', 'purchases');
  const cCostPerConv = col('cost / conv.', 'cost/conv.', 'cost/conv', 'cost per result');
  const cAllConv = col('all conv.', 'all conv', 'total conv');
  const cConvValue = col('conv. value', 'conv value', 'purchase value');
  const cAllConvRate = col('all conv. rate', 'all conv rate', 'total conv rate');
  const cConvRate = col('conv. rate', 'conv rate', 'conversion rate');

  const payload = [];
  for (const r of dataRows) {
    const landing = r[cLanding];
    if (!landing || landing === 'Total') continue;
    const dayRaw = r[cDay];
    const day = dayRaw ? new Date(dayRaw) : null;
    if (!day || isNaN(day.getTime())) continue;

    const { site, path } = parseUrlParts(String(landing).trim());

    payload.push({
      site,
      landing_url: String(landing).trim(),
      landing_path: path,
      campaign: String(r[cCampaign] || '').trim(),
      day: day.toISOString().slice(0,10),
      network: String(r[cNetwork] || '').trim(),
      device: String(r[cDevice] || '').trim(),
      clicks: coerceNum(r[cClicks]),
      impr: coerceNum(r[cImpr]),
      ctr: coerceNum(r[cCTR]),
      avg_cpc: coerceNum(r[cAvgCPC]),
      cost: coerceNum(r[cCost]),
      conversions: coerceNum(r[cConv]),
      cost_per_conv: coerceNum(r[cCostPerConv]),
      all_conv: coerceNum(r[cAllConv]),
      conv_value: coerceNum(r[cConvValue]),
      all_conv_rate: coerceNum(r[cAllConvRate]),
      conv_rate: coerceNum(r[cConvRate])
    });
  }

  if (!payload.length) return { inserted: 0 };

  // Deduplicate rows that target the same primary key to avoid
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" errors
  const byKey = new Map();
  for (const row of payload) {
    const key = [row.day, row.site, row.landing_path, row.device, row.network, row.campaign].join('|');
    if (!byKey.has(key)) byKey.set(key, row);
  }
  const deduped = Array.from(byKey.values());

  const supabase = getClient();
  const { data, error } = await supabase
    .from('independent_landing_metrics')
    .upsert(deduped, { onConflict: 'day,site,landing_path,device,network,campaign' });

  if (error) throw error;

  // Track first_seen date for each product (landing_path) in a separate table
  const firstSeenMap = new Map();
  for (const row of deduped) {
    const key = row.landing_path;
    const day = row.day;
    const prev = firstSeenMap.get(key);
    if (!prev || day < prev) firstSeenMap.set(key, day);
  }
  if (firstSeenMap.size) {
    const ids = Array.from(firstSeenMap.keys());
    const { data: existed, error: e1 } = await supabase
      .from('independent_new_products')
      .select('product_id')
      .in('product_id', ids);
    if (e1) throw e1;
    const existSet = new Set((existed || []).map(r => r.product_id));
    const insertRows = [];
    firstSeenMap.forEach((day, pid) => {
      if (!existSet.has(pid)) insertRows.push({ product_id: pid, first_seen: day });
    });
    if (insertRows.length) {
      const { error: e2 } = await supabase
        .from('independent_new_products')
        .insert(insertRows);
      if (e2) throw e2;
    }
  }

  return { inserted: data?.length ?? deduped.length };
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
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err); else resolve({ fields, files });
      });
    });
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw new Error('No file uploaded. Use form-data field name "file".');
    const filePath = uploaded.filepath || uploaded.path;
    if (!filePath) throw new Error('Upload failed: file path missing.');
    const result = await handleFile(
      filePath,
      uploaded.originalFilename || uploaded.newFilename || uploaded.name
    );
    res.status(200).json({ ok: true, ...result });
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
