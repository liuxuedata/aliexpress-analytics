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

function parseSheet(path){
  const wb = xlsx.readFile(path);
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
    let key=translit(name);
    const n=counts[key]||0; counts[key]=n+1; if(n) key=key+'_'+(n+1);
    headers.push(key);
  }
  const rows=[];
  // data rows start after summary and description sections
  for(let r=11;r<=range.e.r;r++){
    const row=getRow(r);
    if(row.every(v=>v==null)) continue;
    const first=row[0];
    if(first==null) continue;
    if(typeof first==='string' && first.includes('Итого')) continue;
    const obj={};
    for(let i=0;i<headers.length;i++){
      const val=row[i];
      if(val===undefined) continue;
      if(val==='–' || val==='-') obj[headers[i]] = null;
      else obj[headers[i]] = val;
    }
    rows.push(obj);
  }
  return rows;
}

module.exports = async function handler(req,res){
  if(req.method !== 'POST') return res.status(405).json({ok:false,msg:'method not allowed'});
  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if(err) return res.json({ok:false,msg:err.message});
    const file = files.file && files.file[0];
    if(!file) return res.json({ok:false,msg:'missing file'});
    try{
      const rows = parseSheet(file.path);
      const supabase = supa();
      async function refresh(){
        const { error } = await supabase.rpc('refresh_ozon_schema_cache');
        if(error) console.error('schema cache refresh failed:', error.message);
        await new Promise(r=>setTimeout(r,1000));
      }
      await refresh();
      let attempt = 0;
      let error;
      do{
        const resInsert = await supabase.from('public.ozon_product_report_wide').insert(rows);
        error = resInsert.error;
        if(error && /schema cache/i.test(error.message)){
          await refresh();
        }else{
          break;
        }
      }while(attempt++ < 2);
      fs.unlinkSync(file.path);
      if(error) throw error;
      res.json({ok:true, inserted: rows.length});
    }catch(e){
      res.json({ok:false,msg:e.message});
    }
  });
};
