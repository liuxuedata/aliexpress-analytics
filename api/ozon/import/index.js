// /api/ozon/import/index.js  —— Ozon 报表上传（完整可替换版，CommonJS）
// 依赖：@supabase/supabase-js, multiparty, xlsx

const multiparty = require('multiparty');
const xlsx = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

/* ------------------------------------
 * 工具函数
 * ------------------------------------ */
function normalizeTableName(name, fallback = 'ozon_product_report_wide') {
  let t = (name || fallback).trim();
  t = t.replace(/^"+|"+$/g, '');   // 去掉引号
  t = t.replace(/^public\./i, ''); // 去掉 public. 前缀（我们在链路里统一 .schema('public')）
  return t;
}
function ok(res, data) { return res.status(200).json({ ok: true, ...data }); }
function bad(res, code, step, err, extra = {}) {
  const msg = (err && (err.message || err.error || err.toString?.())) || String(err || 'Unknown');
  return res.status(code).json({ ok: false, step, msg, ...extra });
}

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}
// ↑ 你的原函数就是这样写的，这里保留（只是把错误透传做友好一些）。:contentReference[oaicite:1]{index=1}

// 俄文转蛇形 + 别名表（保留你的原逻辑）
const map = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya","і":"i"};
function translit(s){
  return (s||'').toLowerCase()
    .replace(/[а-яёії]/g,ch=>map[ch]||'')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_|_$|__+/g,'_');
}
const headerAliases = {
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_v_poiske_ili_kataloge': 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara': 'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',
  // Ozon occasionally appends "ASUV" to these headers; map them back to the base column
  'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_katalogeasuv': 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_v_poiske_ili_katalogeasuv': 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
  'voronka_prodazh_uv_s_prosmotrom_kartochki_tovaraasuv': 'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovaraasuv': 'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara'
};

function parseSheet(path){
  const wb = xlsx.readFile(path, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const getRow = r => { const row=[]; for(let c=range.s.c;c<=range.e.c;c++){ const cell=sheet[xlsx.utils.encode_cell({r,c})]; row.push(cell?cell.v:null);} return row; };

  const row0 = getRow(0);
  const firstKey = translit(row0[0] || '');
  let headers = [], counts = {}, start;

  if(firstKey === 'tovary'){
    // New template: headers are in the first row
    for(let i=0;i<row0.length;i++){
      let name = row0[i];
      if(!name) continue;
      name = String(name).replace(/\d{2}\.\d{2}\.\d{4}\s*[–-]\s*\d{2}\.\d{2}\.\d{4}/g, '').trim();
      let key = translit(name);
      key = headerAliases[key] || key;
      const n = counts[key] || 0; counts[key] = n + 1; if(n) key = key + '_' + (n + 1);
      headers.push(key);
    }
    start = 1;
  }else{
    // Legacy template with multi-row headers at row7/row8
    const row7 = getRow(7), row8 = getRow(8);
    let group = null;
    for(let i=0;i<row7.length;i++){
      if(row7[i]) group=row7[i];
      let name=row8[i]||row7[i];
      if(!name) continue;
      if(group && row8[i]) name=group+' '+row8[i];
      name = name.replace(/\d{2}\.\d{2}\.\d{4}\s*[–-]\s*\d{2}\.\d{2}\.\d{4}/g, '').trim();
      let key=translit(name);
      key = headerAliases[key] || key;
      const n=counts[key]||0; counts[key]=n+1; if(n) key=key+'_'+(n+1);
      headers.push(key);
    }
    start = 9;
  }

  const rows=[];
  // 找首行数据（跳过描述/合计）
  while(start<=range.e.r){
    const row=getRow(start);
    const first=row[0];
    if(first && !(typeof first==='string' && first.includes('Итого'))){
      break;
    }
    start++;
  }
  for(let r=start;r<=range.e.r;r++){
    const row=getRow(r);
    if(row.every(v=>v==null)) continue;
    const first=row[0];
    if(first==null) continue;
    if(typeof first==='string' && first.includes('Итого')) continue;
    const obj={};
    for(let i=0;i<headers.length;i++){
      let val=row[i];
      if(val===undefined) continue;
      if(val==='–' || val==='-') val = null;
      const key = headers[i];
      if(key === 'den' && val !== null){
        if(val instanceof Date) val = val.toISOString().slice(0,10);
        else if(typeof val === 'number'){
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          val = d.toISOString().slice(0,10);
        }else if(typeof val === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(val)){
          const [dd,mm,yy] = val.split('.');
          val = `${yy}-${mm}-${dd}`;
        }
      }else if(key === 'sku' && val !== null){
        val = String(val);
      }
      obj[key] = val;
    }
    rows.push(obj);
  }
  return rows;
}
// ↑ 上面解析逻辑保持与你现有文件一致。:contentReference[oaicite:2]{index=2}

module.exports = async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({ ok:false, step:'method', msg:'method not allowed' });

  // 解析 multipart
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if(err) return bad(res, 400, 'multipart', err);

    // 取文件：严格要求字段名为 file（和你前端一致）
    const file = files?.file?.[0];
    if(!file){
      return bad(res, 400, 'parse', 'missing file（需要 form-data 字段名 "file"）', {
        gotFileKeys: Object.keys(files || {}),
        gotFieldKeys: Object.keys(fields || {})
      });
    }

    // Supabase client
    let supabase;
    try{ supabase = supa(); }
    catch(e){ return bad(res, 500, 'env', e); } // 更清晰的 env 报错

    // 解析 Excel
    let rows;
    try{
      rows = parseSheet(file.path);
    }catch(e){
      try{ fs.unlinkSync(file.path); }catch(_){}
      return bad(res, 400, 'xlsx-parse', e);
    }

    // 拉取列信息（你的两个 RPC）
    async function refresh(){
      const { error } = await supabase.rpc('refresh_ozon_schema_cache');
      if(error) console.error('schema cache refresh failed:', error.message);
      await new Promise(r=>setTimeout(r,1000));
    }

    let colData;
    try{
      for(let attempt=0;attempt<2;attempt++){
        const { data, error } = await supabase.rpc('get_public_columns', { table_name: 'ozon_product_report_wide' });
        if(!error){ colData = data; break; }
        if(/schema cache/i.test(error.message)){ await refresh(); continue; }
        throw error;
      }
      if(!colData) throw new Error('unable to load column metadata');
    }catch(e){
      try{ fs.unlinkSync(file.path); }catch(_){}
      return bad(res, 400, 'columns-meta', e);
    }

    const tableCols = (colData || []).map(c=>c.column_name);

    // 别名重映射（保留你的原有处理）
    try{
      const renameMap = {};
      const searchLong = 'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_v_poiske_ili_kataloge';
      const searchShort = 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge';
      const searchTrunc = searchLong.slice(0,63);
      const cardLong = 'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara';
      const cardShort = 'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara';
      const cardTrunc = cardLong.slice(0,63);
      if(tableCols.includes(searchLong)) renameMap[searchShort] = searchLong;
      else if(tableCols.includes(searchTrunc)) renameMap[searchShort] = searchTrunc;
      else if(tableCols.includes(searchShort)) renameMap[searchShort] = searchShort;
      if(tableCols.includes(cardLong)) renameMap[cardShort] = cardLong;
      else if(tableCols.includes(cardTrunc)) renameMap[cardShort] = cardTrunc;
      else if(tableCols.includes(cardShort)) renameMap[cardShort] = cardShort;

      if(Object.keys(renameMap).length){
        rows = rows.map(r=>{
          const obj={};
          for(const [k,v] of Object.entries(r)){
            const nk = renameMap[k] || k;
            obj[nk]=v;
          }
          return obj;
        });
      }
    }catch(e){
      try{ fs.unlinkSync(file.path); }catch(_){}
      return bad(res, 400, 'headers-alias', e);
    }

    // 校验必须列 + 拦截未知列（与你现有逻辑一致）
    const cols = Object.keys(rows[0] || {});
    const required = ['tovary','den'];
    const unknown = cols.filter(c=>!tableCols.includes(c));
    const missing = required.filter(c=>!cols.includes(c));
    if(unknown.length || missing.length){
      try{ fs.unlinkSync(file.path); }catch(_){}
      const msgs=[];
      if(unknown.length) msgs.push('unknown columns: '+unknown.join(', '));
      if(missing.length) msgs.push('missing columns: '+missing.join(', '));
      return bad(res, 400, 'columns-check', msgs.join('; '));
    }

    // —— 核心修复点：不要把 schema 写进表名 —— //
    const RAW_TABLE = process.env.OZON_TABLE_NAME || 'ozon_product_report_wide';
    const TABLE = normalizeTableName(RAW_TABLE);

    // 预检（可访问性）
    const pre = await supabase.schema('public').from(TABLE).select('*', { head:true, count:'exact' }).limit(1);
    if (pre.error){
      try{ fs.unlinkSync(file.path); }catch(_){}
      return bad(res, 400, 'preflight', pre.error, { table: TABLE, rawTable: RAW_TABLE });
    }

    // 按主键聚合上传行，避免文件内部重复
    const sumFields = [
      'voronka_prodazh_posescheniya_kartochki_tovara',
      'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',
      'voronka_prodazh_pokazy_v_poiske_i_kataloge',
      'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
      'voronka_prodazh_pokazy_vsego',
      'voronka_prodazh_unikalnye_posetiteli_vsego',
      'voronka_prodazh_zakazano_tovarov'
    ];
    const mapRows = new Map();
    for(const r of rows){
      const key = `${r.sku}||${r.model}||${r.den}`;
      const existing = mapRows.get(key);
      if(existing){
        for(const f of sumFields){
          existing[f] = (Number(existing[f])||0) + (Number(r[f])||0);
        }
      }else{
        mapRows.set(key, { ...r });
      }
    }
    rows = Array.from(mapRows.values());

    let inserted = 0, duplicates = 0;
    for(const row of rows){
      // 先尝试插入
      let attempt = 0, insErr;
      do{
        const resIns = await supabase.schema('public').from(TABLE).insert(row);
        insErr = resIns.error;
        if(insErr && /schema cache/i.test(insErr.message)){
          await refresh();
        }else{
          break;
        }
      }while(attempt++ < 2);

      if(insErr){
        if(insErr.code === '23505'){ // 主键重复，需叠加
          duplicates++;
          let selErr, data, attemptSel = 0;
          do{
            const resSel = await supabase
              .schema('public')
              .from(TABLE)
              .select(sumFields.join(','))
              .eq('sku', row.sku)
              .eq('model', row.model)
              .eq('den', row.den)
              .single();
            selErr = resSel.error; data = resSel.data;
            if(selErr && /schema cache/i.test(selErr.message)){
              await refresh();
            }else{
              break;
            }
          }while(attemptSel++ < 2);
          if(selErr){
            try{ fs.unlinkSync(file.path); }catch(_){}
            return bad(res, 400, 'db-select', selErr, { table: TABLE });
          }

          const update = { ...row };
          for(const f of sumFields){
            update[f] = (Number(data?.[f])||0) + (Number(row[f])||0);
          }

          let updErr, attemptUpd = 0;
          do{
            const resUpd = await supabase
              .schema('public')
              .from(TABLE)
              .update(update)
              .eq('sku', row.sku)
              .eq('model', row.model)
              .eq('den', row.den);
            updErr = resUpd.error;
            if(updErr && /schema cache/i.test(updErr.message)){
              await refresh();
            }else{
              break;
            }
          }while(attemptUpd++ < 2);
          if(updErr){
            try{ fs.unlinkSync(file.path); }catch(_){}
            return bad(res, 400, 'db-update', updErr, { table: TABLE });
          }
        }else{
          try{ fs.unlinkSync(file.path); }catch(_){}
          return bad(res, 400, 'db-insert', insErr, { table: TABLE });
        }
      }else{
        inserted++;
      }
    }

    // 清理临时文件
    try{ fs.unlinkSync(file.path); }catch(_){}

    return ok(res, { inserted, duplicates, table: TABLE });
  });
};
