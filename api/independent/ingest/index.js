// pages/api/independent/ingest/index.js
import { createClient } from '@supabase/supabase-js';
import Busboy from 'busboy';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const config = { api: { bodyParser: false } }; // 必须：我们自己解析 multipart

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
  if (hasPct) return n / 100;   // "7.2%" -> 0.072
  return n > 1 ? n / 100 : n;   // 7.2 -> 0.072；0.072 保持
}
function asDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // 兼容 2025-08-17 / 20250817 / 2025/08/17 / Excel 日期
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y,m,d] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // Excel 序列日期
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
function pick(o, keys) {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  }
  return undefined;
}

// 列名映射（兼容大小写/同义）
const COLS = {
  site: ['site','网站','站点','Site'],
  landing_url: ['landing_url','landing url','url','final_url','landing page url','Landing page','Final URL'],
  landing_path: ['landing_path','path','页面路径','Path'],
  campaign: ['campaign','Campaign','广告系列','Ad campaign'],
  day: ['day','date','日期','Day','Date'],
  network: ['network','Network','广告网络'],
  device: ['device','Device','设备'],
  clicks: ['clicks','Clicks','点击'],
  impr: ['impr','impressions','Impr','Impressions','展示','曝光'],
  ctr: ['ctr','CTR','点击率'],
  avg_cpc: ['avg_cpc','Avg. CPC','平均点击费用','Avg CPC'],
  cost: ['cost','Cost','费用','Spend'],
  conversions: ['conversions','Conv.','转化','Conversions'],
  cost_per_conv: ['cost_per_conv','Cost/conv.','每次转化费用','CPC (Conv)'],
  all_conv: ['all_conv','All conv.','所有转化','All conversions'],
  conv_value: ['conv_value','Conv. value','转化价值','Conversion value'],
  all_conv_rate: ['all_conv_rate','All conv. rate','所有转化率'],
  conv_rate: ['conv_rate','Conv. rate','转化率'],
};

// 行归一化：返回与表结构一致的对象
function normalizeRow(r) {
  const site = String(pick(r, COLS.site) ?? '').trim();
  const landing_url = String(pick(r, COLS.landing_url) ?? '').trim();
  const pathIn = pick(r, COLS.landing_path) ?? landing_url;

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
    conv_value: toNum(pick(r, COLS.conv_value)),
    all_conv_rate: toRate(pick(r, COLS.all_conv_rate)),
    conv_rate: toRate(pick(r, COLS.conv_rate)),
  };
  // 主键字段必须
  if (!row.day || !row.site || !row.landing_path) return null;
  return row;
}

// 读取 multipart 文件为 Buffer
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

// 解析 CSV 或 XLSX -> 数组对象
function parseTable({ filename, buffer }) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }
  // 默认按 CSV 解析
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
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY; // 建议 Service Role 以支持 upsert
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const files = await readUpload(req);
    if (!files.length) return res.status(400).json({ error: 'No file uploaded. field name must be "file"' });

    // 仅处理第一份文件
    const rowsRaw = parseTable(files[0]);

    // 归一化 & 去重（按唯一键）
    const keyOf = (x) => [x.day, x.site, x.landing_path, x.device, x.network, x.campaign].join('||');
    const map = new Map();
    for (const r of rowsRaw) {
      const norm = normalizeRow(r);
      if (!norm) continue;
      map.set(keyOf(norm), norm);
    }
    const rows = Array.from(map.values());
    const dry = req.query?.dry_run === '1' || req.query?.dry === '1';

    if (dry) {
      return res.status(200).json({ ok: true, dry_run: true, count: rows.length, sample: rows.slice(0, 10) });
    }

    // 分批 upsert（避免 10MB 请求体或 30s 超时等）
    const TABLE = 'independent_landing_metrics';
    const CHUNK = 1000;
    let upserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(TABLE)
        .upsert(chunk, { onConflict: 'day,site,landing_path,device,network,campaign' });
      if (error) {
        return res.status(500).json({ error: error.message, chunk_from: i, chunk_to: i + CHUNK });
      }
      upserted += chunk.length;
    }

    return res.status(200).json({ ok: true, upserted });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
