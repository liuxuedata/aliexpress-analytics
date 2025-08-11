// pages/api/ingest/index.js —— 方案1（只改 ingest）：不写入转换率列，multiparty 解析
export const config = { api: { bodyParser: false } };

function toNumber(v){ if (v==null||v==='') return 0; if (typeof v==='number') return Number.isFinite(v)?v:0; const n=Number(String(v).replace(/,/g,'').trim()); return Number.isFinite(n)?n:0; }
function normalizeHeader(h){ return String(h||'').toLowerCase().replace(/\s+/g,'').replace(/[%（）()]/g,'').replace(/：/g,':'); }
const SYNONYMS = {
  product_id: ['商品id','商品ID','产品id','产品ID','id','product id','product_id','商品Id'],
  impressions: ['搜索曝光量','曝光量','searchimpressions','曝光'],
  visitors: ['商品访客数','访客数','访客人数','商品访问数','uniquevisitors','visitors'],
  pageviews: ['商品浏览量','浏览量','pageviews','商品pv','pv'],
  add_to_cart_users: ['商品加购人数','加购人数','加购买家数'],
  add_to_cart_qty: ['商品加购件数','加购件数'],
  pay_items: ['支付件数','付款件数'],
  pay_orders: ['支付订单数','订单数','支付订单'],
  pay_buyers: ['支付买家数','支付人数','付款买家数'],
};
function pickField(row, keys){ for (const k of keys){ if (k in row) return row[k]; const f=Object.keys(row).find(h=>normalizeHeader(h)===normalizeHeader(k)); if (f) return row[f]; } return ''; }
function pickText(row, keys){ const v=pickField(row, keys); return v==null?'':String(v).trim(); }
function pickNumber(row, keys){ return toNumber(pickField(row, keys)); }
function parseDateFromFilename(name){ const m=String(name||'').match(/(20\d{2})(\d{2})(\d{2})/); return m?`${m[1]}-${m[2]}-${m[3]}`:null; }

export default async function handler(req,res){
  if (req.method==='GET') return res.status(200).json({ok:true,msg:'ingest alive'});
  if (req.method!=='POST') return res.status(405).json({ok:false,msg:'Use POST with form-data: file + period_end(optional)'});

  let multiparty, XLSX, fs, createClient;
  try {
    multiparty=(await import('multiparty')).default;
    XLSX=(await import('xlsx')).default;
    fs=(await import('fs')).default;
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch(e){ return res.status(500).json({ok:false,stage:'import',msg:e.message}); }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY, { auth:{persistSession:false} });

  let fields, files;
  try{
    const form=new multiparty.Form({ uploadDir:'/tmp', maxFields:1000 });
    ({fields,files}=await new Promise((resolve,reject)=>form.parse(req,(err,flds,fls)=>err?reject(err):resolve({fields:flds,files:fls}))));
  }catch(e){ return res.status(400).json({ok:false,stage:'multipart',msg:e.message}); }

  try{
    const fx=files.file||files.excel||files.upload; if(!fx) return res.status(400).json({ok:false,stage:'input',msg:'缺少文件字段(file/excel/upload)'});
    const f0=Array.isArray(fx)?fx[0]:fx; const fp=f0.filepath||f0.path; const ofn=f0.originalFilename||f0.filename||f0.name;
    if(!fp) return res.status(400).json({ok:false,stage:'input',msg:'无法读取临时文件路径'});
    const explicit = fields.period_end && fields.period_end[0] ? String(fields.period_end[0]) : null;
    const period_end = explicit || parseDateFromFilename(ofn); if(!period_end) return res.status(400).json({ok:false,stage:'period',msg:'无法确定周期（period_end 或 文件名包含 YYYYMMDD）'});

    const buf=await fs.promises.readFile(fp);
    const wb=XLSX.read(buf,{type:'buffer'}); let rows=[];
    for(const sn of wb.SheetNames){ const ws=wb.Sheets[sn]; const r=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''}); if(r&&r.length){ rows=r; break; } }
    if(!rows.length) return res.status(400).json({ok:false,stage:'xlsx',msg:'Excel 为空'});

    const records=[];
    for(const row of rows){
      const m=String(pickText(row,SYNONYMS.product_id)).match(/(\d{6,})/); if(!m) continue;
      records.push({
        product_id: m[0],
        period_type: 'week',
        period_end,
        impressions:       pickNumber(row,SYNONYMS.impressions),
        visitors:          pickNumber(row,SYNONYMS.visitors),
        pageviews:         pickNumber(row,SYNONYMS.pageviews),
        add_to_cart_users: pickNumber(row,SYNONYMS.add_to_cart_users),
        add_to_cart_qty:   pickNumber(row,SYNONYMS.add_to_cart_qty),
        pay_items:         pickNumber(row,SYNONYMS.pay_items),
        pay_orders:        pickNumber(row,SYNONYMS.pay_orders),
        pay_buyers:        pickNumber(row,SYNONYMS.pay_buyers),
      });
    }

    const dry=(req.query?.dry_run==='1'||(fields.dry_run&&fields.dry_run[0]==='1'));
    if(dry) return res.status(200).json({ok:true,dry_run:true,period_end,count:records.length,sample:records.slice(0,10)});

    const { data, error } = await supabase
      .from('managed_stats')
      .upsert(records, { onConflict: 'product_id,period_type,period_end' })
      .select('product_id');
    if(error) return res.status(500).json({ok:false,stage:'upsert',msg:error.message});

    return res.status(200).json({ok:true,period_end,count:data?.length||records.length});
  }catch(e){ return res.status(500).json({ok:false,stage:'unknown',msg:e.message}); }
}
