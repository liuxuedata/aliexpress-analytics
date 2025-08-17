const multiparty = require('multiparty');
const xlsx = require('xlsx');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function supa(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

// transliterate Russian headers to snake_case
const map = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya","і":"i"};
function translit(s){
  return (s||'').toLowerCase()
    .replace(/[а-яёії]/g,ch=>map[ch]||'')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_|_$|__+/g,'_');
}

const headerAliases = {
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_v_poiske_ili_kataloge': 'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
  'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara': 'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara'
};

function parseSheet(path){
  const wb = xlsx.readFile(path, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const getRow = r => { const row=[]; for(let c=range.s.c;c<=range.e.c;c++){ const cell=sheet[xlsx.utils.encode_cell({r,c})]; row.push(cell?cell.v:null);} return row; };
  const row7 = getRow(7), row8 = getRow(8);
  let group=null, headers=[], counts={};
  for(let i=0;i<row7.length;i++){
    if(row7[i]) group=row7[i];
    let name=row8[i]||row7[i];
    if(!name) continue;
    if(group && row8[i]) name=group+' '+row8[i];
    // drop date ranges like "08.08.2025 – 15.08.2025" from header names
    name = name.replace(/\d{2}\.\d{2}\.\d{4}\s*[–-]\s*\d{2}\.\d{2}\.\d{4}/g, '').trim();
    let key=translit(name);
    key = headerAliases[key] || key;
    const n=counts[key]||0; counts[key]=n+1; if(n) key=key+'_'+(n+1);
    headers.push(key);
  }
  const rows=[];
  // data rows start after header rows; skip optional description/summary lines
  for(let r=9;r<=range.e.r;r++){
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

module.exports = async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if(err) return res.json({ error: err.message });
    const file = files.file && files.file[0];
    if(!file) return res.json({ error: 'missing file' });
    try{
      let rows = parseSheet(file.path);
      let cols = Object.keys(rows[0] || {});
      const supabase = supa();

      async function refresh(){
        const { error } = await supabase.rpc('refresh_ozon_schema_cache');
        if(error) console.error('schema cache refresh failed:', error.message);
        await new Promise(r=>setTimeout(r,1000));
      }

      let colData;
      for(let attempt=0;attempt<2;attempt++){
        const { data, error } = await supabase
          .rpc('get_public_columns', { table_name: 'ozon_product_report_wide' });
        if(!error){
          colData = data;
          break;
        }
        if(/schema cache/i.test(error.message)){
          await refresh();
          continue;
        }
        throw error;
      }
      if(!colData) throw new Error('unable to load column metadata');
      const tableCols = (colData || []).map(c=>c.column_name);

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
        cols = Object.keys(rows[0] || {});
      }

      const required = ['tovary','den'];
      const unknown = cols.filter(c=>!tableCols.includes(c));
      const missing = required.filter(c=>!cols.includes(c));
      if(unknown.length || missing.length){
        fs.unlinkSync(file.path);
        let msgs=[];
        if(unknown.length) msgs.push('unknown columns: '+unknown.join(', '));
        if(missing.length) msgs.push('missing columns: '+missing.join(', '));
        return res.status(400).json({ error: msgs.join('; ') });
      }

      await refresh();
      let attempt = 0;
      let error;
      do{
        const resInsert = await supabase
          .from('public.ozon_product_report_wide')
          .upsert(rows, { onConflict: 'tovary,den' });
        error = resInsert.error;
        if(error && /schema cache/i.test(error.message)){
          await refresh();
        }else{
          break;
        }
      }while(attempt++ < 2);
      fs.unlinkSync(file.path);
      if(error){
        console.error('Ozon report insert failed:', error);
        const parts = [error.message, error.details, error.hint];
        if(!parts.filter(Boolean).length){
          try{
            parts.push(JSON.stringify(error));
          }catch(_){
            parts.push(String(error));
          }
        }
        const msg = parts.filter(Boolean).join(' | ');
        return res.status(400).json({ error: msg });
      }
      res.json({ ok: true, inserted: rows.length });
    }catch(e){
      try{ fs.unlinkSync(file.path); }catch(_){ /* ignore */ }
      const msg = e?.message || e?.error_description || String(e);
      res.status(400).json({ error: msg });
    }
  });
};
