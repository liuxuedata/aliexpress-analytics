window.productMetaCache = window.productMetaCache || {};
async function getProductMeta(pid, link){
  if(window.productMetaCache[pid]) return window.productMetaCache[pid];
  const url = link || `https://aliexpress.com/item/${pid}.html`;
  try{
    const res = await fetch('/api/aliex_fetchProductInfo?url='+encodeURIComponent(url));
    const j = await res.json();
    const meta = { title: j.title || pid, image: j.image || '' };
    window.productMetaCache[pid] = meta;
    return meta;
  }catch(e){
    const meta = { title: pid, image: '' };
    window.productMetaCache[pid] = meta;
    return meta;
  }
}
async function populateProductNames(root){
  const els = Array.from(root.querySelectorAll('[data-pid]'));
  const ids = [...new Set(els.map(el=>el.dataset.pid))];
  const metaMap = {};
  await Promise.all(ids.map(async id=>{
    const el = els.find(e=>e.dataset.pid===id);
    metaMap[id] = await getProductMeta(id, el && el.dataset.link);
  }));
  els.forEach(el=>{
    const m = metaMap[el.dataset.pid];
    if(m && m.title) el.textContent = m.title;
  });
}
