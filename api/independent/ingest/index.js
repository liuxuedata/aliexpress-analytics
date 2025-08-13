// /api/independent/ingest/index.js
// Upload Google Ads Landing Pages export (xlsx or csv) and upsert into Supabase
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY (insert allowed by RLS)
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs');
const XLSX = require('xlsx');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
);

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
  const n = Number(String(x).toString().replace(/[%,$]/g,''));
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

  // Find header row (contains "Landing page", "Campaign", "Day", "Clicks", "Impr.", "CTR"...)
  let headerIdx = rows.findIndex(r => (r||[]).some(c => String(c||'').trim() === 'Landing page'));
  if (headerIdx === -1) throw new Error('Header row not found. Make sure the sheet has a "Landing page" column.');
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  const col = (name) => header.findIndex(h => String(h||'').trim() === name);

  const cLanding = col('Landing page');
  const cCampaign = col('Campaign');
  const cDay = col('Day');
  const cNetwork = col('Network (with search partners)');
  const cDevice = col('Device');
  const cClicks = col('Clicks');
  const cImpr = col('Impr.');
  const cCTR = col('CTR');
  const cAvgCPC = col('Avg. CPC');
  const cCost = col('Cost');
  const cConv = col('Conversions');
  const cCostPerConv = col('Cost / conv.');
  const cAllConv = col('All conv.');
  const cConvValue = col('Conv. value');
  const cAllConvRate = col('All conv. rate');
  const cConvRate = col('Conv. rate');

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

  const { data, error } = await supabase
    .from('independent_landing_metrics')
    .upsert(payload, { onConflict: 'day,site,landing_path,device,network,campaign' });

  if (error) throw error;
  return { inserted: data?.length ?? payload.length };
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
    const file = files.file;
    if (!file) throw new Error('No file uploaded. Use form-data field name "file".');
    const result = await handleFile(
      file.filepath || file.path,
      file.originalFilename || file.newFilename || file.name
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
