/**
 * Adaptive ingest for managed stats
 * - Only writes columns that actually exist in the DB table.
 * - Keeps: multiparty parsing, XLSX reading, ?dry_run=1 support.
 * - Excludes: product_link and any "rate" columns from writes.
 *
 * Deploy path: /api/ingest/index.js (Vercel @vercel/node)
 *
 * Env vars needed:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   MANAGED_TABLE_NAME (optional, default: "managed_stats")
 *   MANAGED_STATS_COLS (optional, comma-separated override when table is empty)
 */
'use strict';

const multiparty = require('multiparty');
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.MANAGED_TABLE_NAME || 'managed_stats';

function toNum(v){
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g,'').trim());
  return Number.isNaN(n) ? 0 : n;
}
function excelDateToISO(n){
  if (typeof n !== 'number') return null;
  const utc_days = Math.floor(n - 25569);
  const utc_value = utc_days * 86400;
  const d = new Date(utc_value * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDateToISO(v){
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return excelDateToISO(v);
  let s = String(v).trim();
  s = s.replace(/[.]/g,'-').replace(/\//g,'-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  return s.slice(0,10);
}
function isSunday(iso){ const d = new Date(iso+'T00:00:00Z'); return d.getUTCDay() === 0; }
function isMonthEnd(iso){
  const d = new Date(iso+'T00:00:00Z');
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1));
  return next.getUTCDate() === 1;
}

/** Map various header names to normalized keys used internally */
function headerIndex(headers){
  const find = (regexArr) => {
    for (const re of regexArr){
      const i = headers.findIndex(h => re.test(String(h||'').trim()));
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    product_id: find([/^(商品)?ID$|^商品id$|^id$|^item id$|^item_id$/i]),
    stat_date:  find([/^(统计时间|统计日期|日期|数据时间|date|期间|period)$/i]),
    search_exposure: find([/^(搜索)?曝光量$|^商品曝光量$|^impressions?$/i]),
    uv:         find([/^(商品)?访客数$|^访客人数$|^访客量$|^uv$|^sessions$/i]),
    pv:         find([/^(商品)?浏览量$|^浏览量$|^pv$|^page ?views?$/i]),
    add_to_cart_users: find([/^(商品)?加购人数$|^加购买家数$|^加购人?数$/i, /^atc[_ ]?users?$/i]),
    add_to_cart_qty:   find([/^(商品)?加购件数$|^加购量$|^加购数量$/i, /^atc[_ ]?qty$/i]),
    pay_items:  find([/^支付件数$/i]),
    pay_orders: find([/^(支付订单数|下单人数|订单数)$/i]),
    pay_buyers: find([/^(支付买家数|支付人数|成交人数)$/i]),
    product_link: find([/^商品链接$|^链接$|^url$|^product ?link$/i])
  };
}

/** Normalize one excel row -> normalized object */
function normalizeRow(row, idx){
  const pid = String(row[idx.product_id] ?? '').trim();
  const sd  = idx.stat_date === -1 ? null : parseDateToISO(row[idx.stat_date]);
  const o = {
    product_id: pid,
    stat_date: sd,
    search_exposure: idx.search_exposure === -1 ? 0 : toNum(row[idx.search_exposure]),
    uv:              idx.uv             === -1 ? 0 : toNum(row[idx.uv]),
    pv:              idx.pv             === -1 ? 0 : toNum(row[idx.pv]),
    add_to_cart_users: idx.add_to_cart_users === -1 ? 0 : toNum(row[idx.add_to_cart_users]),
    add_to_cart_qty:   idx.add_to_cart_qty   === -1 ? 0 : toNum(row[idx.add_to_cart_qty]),
    pay_items:  idx.pay_items  === -1 ? 0 : toNum(row[idx.pay_items]),
    pay_orders: idx.pay_orders === -1 ? 0 : toNum(row[idx.pay_orders]),
    pay_buyers: idx.pay_buyers === -1 ? 0 : toNum(row[idx.pay_buyers]),
  };
  // NEVER include product_link or any rate columns in writes
  return o;
}

/** Choose the first column name that exists in the table columns */
function choose(existingCols, candidates){
  for (const c of candidates){
    if (existingCols.has(c)) return c;
  }
  // if none matched, return the first (so caller may decide to drop if absent)
  return candidates[0];
}

/** Build a mapper from normalized -> actual DB column names */
function buildColumnMapper(existingCols){
  const S = (arr) => choose(existingCols, arr);
  return {
    product_id: S(['product_id','item_id','pid']),
    period_col: S(['period_end','stat_date','date','period_key','period']),
    search_exposure: S(['search_exposure','impressions']),
    uv: S(['uv','visitors']),
    pv: S(['pv','views']),
    add_to_cart_users: S(['add_to_cart_users','atc_users']),
    add_to_cart_qty: S(['add_to_cart_qty','atc_qty']),
    pay_items: S(['pay_items']),
    pay_orders: S(['pay_orders']),
    pay_buyers: S(['pay_buyers'])
  };
}

/** Detect table columns by sampling one row; fallback to env override */
async function detectExistingColumns(supabase){
  const setFromEnv = (process.env.MANAGED_STATS_COLS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if (setFromEnv.length){
    return new Set(setFromEnv);
  }
  const { data, error } = await supabase.from(TABLE).select('*').limit(1);
  if (error){
    // last resort: assume the "long name" schema
    return new Set(['product_id','period_end','search_exposure','uv','pv','add_to_cart_users','add_to_cart_qty','pay_items','pay_orders','pay_buyers']);
  }
  if (Array.isArray(data) && data.length){
    return new Set(Object.keys(data[0]));
  }
  // table empty -> still try a sane default that covers most installs
  return new Set(['product_id','period_end','search_exposure','uv','pv','add_to_cart_users','add_to_cart_qty','pay_items','pay_orders','pay_buyers']);
}

/** Parse incoming multipart form and return file path */
function parseMultipart(req){
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({ autoFiles: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const f = files && (files.file || files.upload || files.data || files.xlsx);
      if (!f || !f[0]) return reject(new Error('缺少文件字段（file）'));
      resolve({ filePath: f[0].path, fields });
    });
  });
}

/** Read workbook and produce normalized rows + detected period/date */
function parseWorkbook(filePath){
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (!sheet || sheet.length < 2) throw new Error('表格无有效数据');
  const headers = (sheet[0] || []).map(h => String(h||'').trim());
  const idx = headerIndex(headers);
  if (idx.product_id < 0){
    throw new Error('缺少必填列：商品ID');
  }
  // Try detect a single period date from the sheet (first non-empty stat_date)
  let periodISO = null;
  if (idx.stat_date !== -1){
    for (let r=1; r<sheet.length; r++){
      periodISO = parseDateToISO(sheet[r][idx.stat_date]);
      if (periodISO) break;
    }
  }
  if (!periodISO){
    // fallback: today in UTC
    const today = new Date();
    periodISO = today.toISOString().slice(0,10);
  }
  const type = isMonthEnd(periodISO) ? 'month' : (isSunday(periodISO) ? 'week' : 'day');

  const rows = sheet.slice(1).filter(r => r && r.length).map(r => normalizeRow(r, idx))
    .filter(x => x.product_id);

  // de-dup by product_id + periodISO
  const map = new Map();
  for (const row of rows){
    const key = row.product_id + '__' + periodISO;
    map.set(key, row);
  }
  return { periodISO, type, rows: Array.from(map.values()) };
}

/** Upsert rows in chunks; only keep allowed columns */
async function upsertAdaptive(supabase, mapper, existingCols, periodISO, rows, isDryRun){
  const filtered = rows.map(r => {
    const out = {};
    // include product_id + period column
    if (existingCols.has(mapper.product_id)) out[mapper.product_id] = String(r.product_id);
    if (existingCols.has(mapper.period_col)) out[mapper.period_col] = periodISO;

    // include metric columns only if they exist in table
    const pairs = [
      ['search_exposure','search_exposure'],
      ['uv','uv'],
      ['pv','pv'],
      ['add_to_cart_users','add_to_cart_users'],
      ['add_to_cart_qty','add_to_cart_qty'],
      ['pay_items','pay_items'],
      ['pay_orders','pay_orders'],
      ['pay_buyers','pay_buyers']
    ];
    for (const [norm, mapKey] of pairs){
      const dbCol = mapper[mapKey];
      if (existingCols.has(dbCol)){
        out[dbCol] = toNum(r[norm] || 0);
      }
    }
    return out;
  });

  if (isDryRun){
    return { upserted: filtered.length };
  }

  const CHUNK = 1000;
  let upserted = 0;
  for (let i = 0; i < filtered.length; i += CHUNK){
    const chunk = filtered.slice(i, i + CHUNK);
    const { error } = await supabase.from(TABLE).upsert(chunk); // rely on PK/unique index
    if (error){
      return { error };
    }
    upserted += chunk.length;
  }
  return { upserted };
}

module.exports = async (req, res) => {
  try{
    if (!SUPABASE_URL || !SERVICE_ROLE){
      return res.status(500).json({ ok:false, msg:'缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (req.method !== 'POST'){
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok:false, msg:'Method Not Allowed' });
    }
    const dryRun = (req.url && /\bdry_run=1\b/.test(req.url)) ? true : false;

    const { filePath } = await parseMultipart(req);
    const { periodISO, type, rows } = parseWorkbook(filePath);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const existingCols = await detectExistingColumns(supabase);
    const mapper = buildColumnMapper(existingCols);

    const result = await upsertAdaptive(supabase, mapper, existingCols, periodISO, rows, dryRun);
    if (result.error){
      return res.status(500).json({ ok:false, step:'upsert', msg: result.error.message || String(result.error) });
    }

    return res.status(200).json({
      ok: true,
      type,
      date: periodISO,
      rows: rows.length,
      dry_run: dryRun,
      table: TABLE
    });
  }catch(err){
    return res.status(500).json({ ok:false, msg: err && err.message ? err.message : String(err) });
  }
};
