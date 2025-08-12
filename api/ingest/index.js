/**
 * Ingest for managed_stats — schema-aligned (auto-pruning + period_type + extras)
 * Matches columns provided by user:
 *   period_type (text), period_end (date), product_id (text),
 *   search_exposure(bigint), uv(bigint), pv(bigint),
 *   add_to_cart_users(bigint), add_to_cart_qty(bigint), fav_users(bigint),
 *   pay_items(bigint), pay_orders(bigint), pay_buyers(bigint),
 *   suborders_30d(bigint), is_warehouse(boolean), is_premium(boolean),
 *   inserted_at(timestamptz) [auto by DB]
 * Excludes from writes: product_link, pay_rate, rank_percent, visitor_to_add, add_to_pay, visitor_ratio.
 *
 * Other features:
 * - Detects/validates existing columns; upsert auto-prunes unknown columns and retries.
 * - Auto computes period_type=day/week/month; writes period_end as the detected date.
 * - Supports multiparty, xlsx, ?dry_run=1.
 *
 * Deploy: /api/ingest/index.js
 */
'use strict';

const multiparty = require('multiparty');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = process.env.MANAGED_TABLE_NAME || 'managed_stats';
const REQUIRE_BOUNDARY = String(process.env.REQUIRE_PERIOD_BOUNDARY || '0') === '1'; // 可选：要求周日或月底

function toNum(v){
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/,/g,'').trim());
  return Number.isNaN(n) ? 0 : n;
}
function toBool(v){
  if (typeof v === 'boolean') return v;
  const s = String(v||'').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return false;
}
function excelDateToISO(n){
  if (typeof n !== 'number') return null;
  const base = new Date(Date.UTC(1899,11,30)); // Excel epoch
  const d = new Date(base.getTime() + Math.round(n)*86400000);
  return d.toISOString().slice(0,10);
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

// Header mapping
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
    fav_users: find([/^收藏人数$|^关注人数$|^favor(it|)e(d)? users?$/i]),
    pay_items:  find([/^支付件数$/i]),
    pay_orders: find([/^(支付订单数|下单人数|订单数)$/i]),
    pay_buyers: find([/^(支付买家数|支付人数|成交人数)$/i]),
    suborders_30d: find([/^近?30[天日]?(子)?订单(数)?$/i, /^suborders[_ ]?30d$/i]),
    is_warehouse: find([/^是否(前置)?仓$/i, /^is[_ ]?warehouse$/i]),
    is_premium: find([/^是否(高端|优选)$/i, /^is[_ ]?premium$/i]),
    product_link: find([/^商品链接$|^链接$|^url$|^product ?link$/i])
  };
}

function normalizeRow(row, idx){
  const pid = String(row[idx.product_id] ?? '').trim();
  const o = {
    product_id: pid,
    search_exposure: idx.search_exposure === -1 ? 0 : toNum(row[idx.search_exposure]),
    uv:              idx.uv             === -1 ? 0 : toNum(row[idx.uv]),
    pv:              idx.pv             === -1 ? 0 : toNum(row[idx.pv]),
    add_to_cart_users: idx.add_to_cart_users === -1 ? 0 : toNum(row[idx.add_to_cart_users]),
    add_to_cart_qty:   idx.add_to_cart_qty   === -1 ? 0 : toNum(row[idx.add_to_cart_qty]),
    fav_users:   idx.fav_users   === -1 ? 0 : toNum(row[idx.fav_users]),
    pay_items:   idx.pay_items   === -1 ? 0 : toNum(row[idx.pay_items]),
    pay_orders:  idx.pay_orders  === -1 ? 0 : toNum(row[idx.pay_orders]),
    pay_buyers:  idx.pay_buyers  === -1 ? 0 : toNum(row[idx.pay_buyers]),
    suborders_30d: idx.suborders_30d === -1 ? 0 : toNum(row[idx.suborders_30d]),
    is_warehouse: idx.is_warehouse === -1 ? false : toBool(row[idx.is_warehouse]),
    is_premium:   idx.is_premium   === -1 ? false : toBool(row[idx.is_premium]),
  };
  return o;
}

function choose(existingCols, candidates){
  for (const c of candidates){
    if (existingCols.has(c)) return c;
  }
  return candidates[0];
}

function buildColumnMapper(existingCols){
  const S = (arr) => choose(existingCols, arr);
  return {
    product_id: S(['product_id','item_id','pid']),
    period_col: S(['period_end','stat_date','date','period_key','period']),
    period_type: S(['period_type','granularity','period_kind','ptype','period_level']),
    search_exposure: S(['search_exposure','impressions']),
    uv: S(['uv','visitors']),
    pv: S(['pv','views']),
    add_to_cart_users: S(['add_to_cart_users','atc_users']),
    add_to_cart_qty: S(['add_to_cart_qty','atc_qty']),
    fav_users: S(['fav_users','favorites','wish_users']),
    pay_items: S(['pay_items']),
    pay_orders: S(['pay_orders']),
    pay_buyers: S(['pay_buyers']),
    suborders_30d: S(['suborders_30d','suborders30d']),
    is_warehouse: S(['is_warehouse','is_wh','warehouse_flag']),
    is_premium: S(['is_premium','premium_flag']),
  };
}

async function detectExistingColumns(supabase){
  const fromEnv = (process.env.MANAGED_STATS_COLS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if (fromEnv.length){
    return new Set(fromEnv);
  }
  const { data, error } = await supabase.from(TABLE).select('*').limit(1);
  if (error){
    // Start with wide set; auto-prune on upsert
    return new Set([
      'product_id','period_end','stat_date','date','period_type','granularity',
      'search_exposure','impressions','uv','visitors','pv','views',
      'add_to_cart_users','atc_users','add_to_cart_qty','atc_qty',
      'fav_users','pay_items','pay_orders','pay_buyers',
      'suborders_30d','is_warehouse','is_premium'
    ]);
  }
  if (Array.isArray(data) && data.length){
    return new Set(Object.keys(data[0]));
  }
  return new Set([
    'product_id','period_end','stat_date','date','period_type','granularity',
    'search_exposure','impressions','uv','visitors','pv','views',
    'add_to_cart_users','atc_users','add_to_cart_qty','atc_qty',
    'fav_users','pay_items','pay_orders','pay_buyers',
    'suborders_30d','is_warehouse','is_premium'
  ]);
}

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
  let periodISO = null;
  if (idx.stat_date !== -1){
    for (let r=1; r<sheet.length; r++){
      periodISO = parseDateToISO(sheet[r][idx.stat_date]);
      if (periodISO) break;
    }
  }
  if (!periodISO){
    periodISO = new Date().toISOString().slice(0,10);
  }
  if (REQUIRE_BOUNDARY){
    const ok = isMonthEnd(periodISO) || isSunday(periodISO);
    if (!ok) throw new Error(`统计日期 ${periodISO} 非周日或月底，已拒绝导入（可设置 REQUIRE_PERIOD_BOUNDARY=0 关闭校验）`);
  }
  const periodType = isMonthEnd(periodISO) ? 'month' : (isSunday(periodISO) ? 'week' : 'day');

  const rows = sheet.slice(1).filter(r => r && r.length).map(r => normalizeRow(r, idx))
    .filter(x => x.product_id);

  // de-dup by product_id + periodISO
  const map = new Map();
  for (const row of rows){
    const key = row.product_id + '__' + periodISO;
    map.set(key, row);
  }
  return { periodISO, periodType, rows: Array.from(map.values()) };
}

function buildPayload(rows, periodISO, periodType, mapper, allowed){
  return rows.map(r => {
    const out = {};
    if (allowed.has(mapper.product_id)) out[mapper.product_id] = String(r.product_id);
    if (allowed.has(mapper.period_col)) out[mapper.period_col] = periodISO;
    if (allowed.has(mapper.period_type)) out[mapper.period_type] = periodType;

    const pairs = [
      ['search_exposure','search_exposure'],
      ['uv','uv'],
      ['pv','pv'],
      ['add_to_cart_users','add_to_cart_users'],
      ['add_to_cart_qty','add_to_cart_qty'],
      ['fav_users','fav_users'],
      ['pay_items','pay_items'],
      ['pay_orders','pay_orders'],
      ['pay_buyers','pay_buyers'],
      ['suborders_30d','suborders_30d'],
      ['is_warehouse','is_warehouse'],
      ['is_premium','is_premium'],
    ];
    for (const [norm, mapKey] of pairs){
      const dbCol = mapper[mapKey];
      if (allowed.has(dbCol)){
        const v = (norm === 'is_warehouse' || norm === 'is_premium') ? !!r[norm] : toNum(r[norm] || 0);
        out[dbCol] = v;
      }
    }
    return out;
  });
}

async function upsertWithAutoPrune(supabase, payload, allowedCols){
  const CHUNK = 1000;
  let upserted = 0;
  const pruneRe = /Could not find the '([^']+)' column/i;

  let currentAllowed = new Set(allowedCols);
  let current = payload.map(obj => ({...obj}));

  while (true){
    let missingCol = null;
    for (let i = 0; i < current.length; i += CHUNK){
      const chunk = current.slice(i, i + CHUNK);
      const { error } = await supabase.from(TABLE).upsert(chunk);
      if (error){
        const m = String(error.message || error).match(pruneRe);
        if (m && m[1]){ missingCol = m[1]; break; }
        return { error };
      }
      upserted += chunk.length;
    }
    if (!missingCol){
      return { upserted };
    }
    if (!currentAllowed.has(missingCol)){
      current = current.map(row => { const r = {...row}; delete r[missingCol]; return r; });
    }else{
      currentAllowed.delete(missingCol);
      current = current.map(row => { const r = {...row}; delete r[missingCol]; return r; });
    }
    upserted = 0;
  }
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
    const { periodISO, periodType, rows } = parseWorkbook(filePath);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const detected = await detectExistingColumns(supabase);
    const mapper = buildColumnMapper(detected);

    const allowed = new Set(detected);
    Object.values(mapper).forEach(c => allowed.add(c));

    const payload = buildPayload(rows, periodISO, periodType, mapper, allowed);

    if (dryRun){
      const keys = new Set();
      payload.slice(0,1).forEach(o => Object.keys(o).forEach(k => keys.add(k)));
      return res.status(200).json({
        ok: true,
        date: periodISO,
        period_type: periodType,
        rows: rows.length,
        dry_run: true,
        table: TABLE,
        will_write_cols: Array.from(keys).sort()
      });
    }

    const result = await upsertWithAutoPrune(supabase, payload, allowed);
    if (result.error){
      return res.status(500).json({ ok:false, step:'upsert', msg: result.error.message || String(result.error) });
    }
    return res.status(200).json({
      ok: true,
      date: periodISO,
      period_type: periodType,
      rows: rows.length,
      table: TABLE
    });
  }catch(err){
    return res.status(500).json({ ok:false, msg: err && err.message ? err.message : String(err) });
  }
};
