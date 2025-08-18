// pages/api/independent/ingest/index.js
import { createClient } from '@supabase/supabase-js';
import Busboy from 'busboy';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const config = { api: { bodyParser: false } }; // 手动解析 multipart

// ---------- 工具函数 ----------
function toNum(v) {
  if (v === null || v === undefined || v === '' || v === '--') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
function toRate(v) {
  if (v === null || v === undefined || v === '' || v === '--') return 0;
  const s = String(v).trim();
  const hasPct = s.includes('%');
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return hasPct ? n / 100 : (n > 1 ? n / 100 : n);
}
function asDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y,m,d] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // Excel serial date
  if (!Number.isNaN(Number(s)) && Number(s) > 25000) {
    const date = XLSX.SSF.parse_date_code(Number(s));
    if (date) return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  return s.slice(0,10);
}
function landingPath(urlOrPath) {
  if (!urlOrPath) return '';
  try {
    const s = String(urlOrPath).trim();
    if (s.startsWith('http')) {
      const u = new URL(s);
      return u.pathname || '/';
    }
    return s.startsWith('/') ? s : `/${s}`;
  } catch { return '/'; }
}
function hostnameOf(u) {
  try { return new URL(String(u)).hostname; } catch { return ''; }
}
function pick(o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// ---------- 列名映射（保留你现有映射，并增加你 CSV 的专用列名） ----------
const COLS = {
  // 你现有的通用映射（含 Landing page）保持
  landing_url: ['Landing page','landing page','landing_url','landing url','url','final_url','Landing page url','Final URL','URL'],
  landing_path: ['landing_path','Path'],

  // 新增：Network (with search partners)
  network: ['Network (with search partners)','network','Network','广告网络'],

  campaign: ['Campaign','campaign','广告系列'],
  device: ['Device','device','设备'],
  day: ['Day','day','Date','date','日期'],

  // 其余保持你的映射
  clicks: ['Clicks','clicks','点击'],
  impr: ['Impr.','impr','Impressions','Impr','展示','曝光'],
  ctr: ['CTR','ctr','点击率'],
  avg_cpc: ['Avg. CPC','avg cpc','avg_cpc','平均点击费用','Avg CPC'],
  cost: ['Cost','cost','Spend','费用'],
  conversions: ['Conversions','conversions','Conv.','转化'],

  // 新增：Avg. cost → cost_per_conv（你原来只有 Cost/conv. / CPC (Conv)）
  cost_per_conv: ['Avg. cost','avg. cost','Cost/conv.','Cost per conv.','CPC (Conv)','cost_per_conv','每次转化费用'],

  all_conv: ['All conv.','all conv.','All conversions','所有转化'],
  all_conv_rate: ['All conv. rate','all conv. rate','All conversions rate','所有转化率'],

  // 可选：如果 CSV 将来出现 Conv. value / Conv. rate 也能识别
  conv_value: ['Conv. value','conv_value','转化价值','Conversion value'],
  conv_rate: ['Conv. rate','conv_rate','转化率'],

  // site：优先 query，其次 CSV，最后从 URL 提域名
  site: ['site','Site','网站','站点'],
};

// ---------- 行归一化 ----------
function normalizeRow(r, querySite, fallbackSiteFromUrl) {
  const landing_url = String(pick(r, COLS.landing_url) ?? '').trim();
  const pathIn = pick(r, COLS.landing_path) ?? landing_url;

  const siteFromCsv = String(pick(r, COLS.site) ?? '').trim();
  const site = (querySite?.trim())
    || (siteFromCsv || fallbackSiteFromUrl || 'independent');

  const row = {
    site,
    landing_url,
    landing_path: landingPath(pathIn),
    campaign: String(pick(r, COLS.campaign) ?? '').trim(),
    day: asDate(pick(r, COLS.day)),
    network: String(pick(r, COLS.network) ?? '').trim(),
    device: String(pick(r, COLS.device) ?? '').trim(),

    clicks: toNum(pick(r, COLS.clicks)),
    impr: toNum(pick(r, COLS.impr)),
    ctr: toRate(pick(r, COLS.ctr)),
    avg_cpc: toNum(pick(r, COLS.avg_cpc)),
    cost: toNum(pick(r, COLS.cost)),
    conversions: toNum(pick(r, COLS.conversions)),
    cost_per_conv: toNum(pick(r, COLS.cost_per_conv)),
    all_conv: toNum(pick(r, COLS.all_conv)),
    conv_value: toNum(pick(r, COLS.conv_value)),      // CSV 没有时为 0
    all_conv_rate: toRate(pick(r, COLS.all_conv_rate)),
    conv_rate: toRate(pick(r, COLS.conv_rate)),       // CSV 没有时为 0
  };

  // 主键字段必须
  if (!row.day || !row.site || !row.landing_path) return null;
  return row;
}

// ---------- 读取 multipart ----------
function readUpload(req) {
  return new Promise((resolve, reject) => {
    const bb = new Busboy({ headers: req.headers });
    const files = [];
    bb.on('file', (_, file, filename) => {
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('end', () => files.push({ filename, buffer: Buffer.concat(chunks) }));
    });
    bb.on('error', reject);
    bb.on('finish', () => resolve(files));
    req.pipe(bb);
  });
}

// ---------- CSV / XLSX 解析 ----------
function parseTable({ filename, buffer }) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }
  const text = buffer.toString('utf8');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data;
}

// ---------- 入口 ----------
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: 'independent/ingest', msg: 'alive' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 环境变量
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY; // 建议用 Service Role
  const TABLE = 'independent_landing_metrics';
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const files = await readUpload(req);
    if (!files.length) return res.status(400).json({ error: 'No file uploaded. field name must be "file"' });

    const rowsRaw = parseTable(files[0]);

    // 取 ?site
    const queryStr = req.url.split('?')[1] || '';
    const querySite = new URLSearchParams(queryStr).get('site');

    // 从 CSV 第一行的 landing_url 里提一个域名作后备 site
    let fallbackSiteFromUrl = '';
    for (const r of rowsRaw) {
      const u = pick(r, COLS.landing_url);
      if (u) { fallbackSiteFromUrl = hostnameOf(u); if (fallbackSiteFromUrl) break; }
    }

    // 归一化 & 去重（按唯一键）
    const keyOf = (x) => [x.day, x.site, x.landing_path, x.device, x.network, x.campaign].join('||');
    const map = new Map();
    for (const r of rowsRaw) {
      const norm = normalizeRow(r, querySite, fallbackSiteFromUrl);
      if (!norm) continue;
      map.set(keyOf(norm), norm);
    }
    const rows = Array.from(map.values());

    const dry = new URL(req.url, 'http://x').searchParams.get('dry_run') === '1'
             || new URL(req.url, 'http://x').searchParams.get('dry') === '1';
    if (dry) {
      return res.status(200).json({ ok: true, dry_run: true, count: rows.length, sample: rows.slice(0, 10) });
    }

    // 分批 upsert（避免体积/超时）
    const CHUNK = 1000;
    let upserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error, status, statusText } = await supabase
        .from(TABLE)
        .upsert(chunk, { onConflict: 'day,site,landing_path,device,network,campaign' });
      if (error) {
        return res.status(500).json({
          error: error.message,
          details: error.details || null,
          hint: error.hint || null,
          code: error.code || null,
          status, statusText,
          chunk_from: i, chunk_to: i + CHUNK
        });
      }
      upserted += chunk.length;
    }
    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error', stack: e?.stack });
  }
}
