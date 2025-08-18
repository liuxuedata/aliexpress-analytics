window.productMetaCache = window.productMetaCache || {};
async function getProductMeta(idOrUrl, link, api){
  const key = idOrUrl;
  if(window.productMetaCache[key]) return window.productMetaCache[key];
  const url = link || (idOrUrl.startsWith('http') ? idOrUrl : `https://aliexpress.com/item/${idOrUrl}.html`);
  const endpoint = api || (url.includes('aliexpress') ? '/api/aliex_fetchProductInfo' : '/api/indep_fetchProductInfo');
  try{
    const res = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url})
    });
    const j = await res.json();
    const meta = { title: j.title || idOrUrl, image: j.image || '' };
    window.productMetaCache[key] = meta;
    return meta;
  }catch(e){
    const meta = { title: idOrUrl, image: '' };
    window.productMetaCache[key] = meta;
    return meta;
  }
}
async function populateProductNames(root){
  const els = Array.from(root.querySelectorAll('[data-pid],[data-url]'));
  const ids = [...new Set(els.map(el=>el.dataset.pid || el.dataset.url))];
  const metaMap = {};
  await Promise.all(ids.map(async id=>{
    const el = els.find(e=>(e.dataset.pid||e.dataset.url)===id);
    const link = el.dataset.link || el.dataset.url || (el.dataset.pid ? `https://aliexpress.com/item/${el.dataset.pid}.html` : '');
    metaMap[id] = await getProductMeta(id, link, el.dataset.api);
  }));
  els.forEach(el=>{
    const id = el.dataset.pid || el.dataset.url;
    const m = metaMap[id];
    if(m && m.title) el.textContent = m.title;
  });
}
