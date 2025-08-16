const xlsx = require('xlsx');

const map = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya","і":"i"};
function translit(s){
  return (s||'').toLowerCase()
    .replace(/[а-яёії]/g,ch=>map[ch]||'')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_|_$|__+/g,'_');
}

function getHeaders(path){
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
    const label = group && row8[i] ? group+' '+row8[i] : name;
    const clean = label.replace(/\d{2}\.\d{2}\.\d{4}\s*[–-]\s*\d{2}\.\d{2}\.\d{4}/g, '').trim();
    let key=translit(clean);
    const n=counts[key]||0; counts[key]=n+1; if(n) key=key+'_'+(n+1);
    headers.push({ key, label });
  }
  return headers;
}

module.exports = async function handler(req,res){
  try{
    const cols = getHeaders('analytics_report_2025-08-16_11_09.xlsx');
    res.json({ok:true, columns: cols});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
