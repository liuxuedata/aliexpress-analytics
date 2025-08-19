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

  // Build a case-insensitive header lookup tolerant of punctuation and spacing
  // Canonicalize headers in a Unicode-aware way so that non-Latin scripts
  // (e.g. Chinese localizations) are preserved for matching.
  // Replace any non letter/number characters and lower-case the rest.
  const canon = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '');
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const cLanding = col('landing page', 'url', 'website url', '着陆页', '网址');
  const cCampaign = col('campaign', 'campaign name', '广告系列');
  const cDay = col('day', 'date', '日期');
  const cNetwork = col(
    'network (with search partners)',
    'network',
    'source',
    'platform',
    '网络'
  );
  const cDevice = col('device', 'device type', '设备');
  const cClicks = col('clicks', 'link clicks', '点击次数');
  const cImpr = col('impr.', 'impressions', '展示次数');
  const cCTR = col('ctr', 'click-through rate', '点击率');
  const cAvgCPC = col('avg. cpc', 'cpc', 'cost per click', '平均每次点击费用');
  const cCost = col('cost', 'amount spent', '费用');
  const cConv = col('conversions', 'results', 'purchases', '转化', '转化次数');
  const cCostPerConv = col(
    'cost / conv.',
    'cost/conv.',
    'cost/conv',
    'cost per result',
    '每次转化费用',
    '每转化费用'
  );
  const cAllConv = col('all conv.', 'all conv', 'total conv', '所有转化', '全部转化');
  const cConvValue = col('conv. value', 'conv value', 'purchase value', '转化价值');
  const cAllConvRate = col(
    'all conv. rate',
    'all conv rate',
    'total conv rate',
    '所有转化率',
    '全部转化率'
  );
  const cConvRate = col('conv. rate', 'conv rate', 'conversion rate', '转化率');
  const cCurrency = col('currency code', 'currency', '货币');

  const payload = [];
  for (const r of dataRows) {
    const landing = r[cLanding];
    if (!landing || landing === 'Total') continue;
    const dayRaw = r[cDay];
    let day = null;
    if (typeof dayRaw === 'number') {
      const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
      if (parsed) {
        day = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      }
    } else if (dayRaw) {
      day = new Date(dayRaw);
    }
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
    if (!byKey.has(key)) byKey.set(key, row);
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
