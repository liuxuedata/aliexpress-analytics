window.productMetaCache = window.productMetaCache || {};

async function fetchBatch(ids){
  const res = await fetch('/api/product-meta?ids='+encodeURIComponent(ids.join(',')));
  const j = await res.json();
  return j.items || {};
}

async function getProductMeta(idOrUrl, link, api){
  const key = idOrUrl;
  if(window.productMetaCache[key]) return window.productMetaCache[key];
  const url = link || (idOrUrl.startsWith('http') ? idOrUrl : `https://aliexpress.com/item/${idOrUrl}.html`);
  if(!api && url.includes('aliexpress')){
    try{
      const batch = await fetchBatch([key]);
      const meta = batch[key] || { title:key, image:'' };
      window.productMetaCache[key] = meta;
      return meta;
    }catch(e){
      const meta = { title:key, image:'' };
      window.productMetaCache[key] = meta;
      return meta;
    }
  }
  const endpoint = api || (url.includes('aliexpress') ? '/api/aliex_fetchProductInfo' : '/api/indep_fetchProductInfo');
  try{
    const res = await fetch(endpoint+'?url='+encodeURIComponent(url));
    const j = await res.json();
    const meta = { title: j.title || key, image: j.image || '' };
    window.productMetaCache[key] = meta;
    return meta;
  }catch(e){
    const meta = { title:key, image:'' };
    window.productMetaCache[key] = meta;
    return meta;
  }
}

async function populateProductNames(root){
  const els = Array.from(root.querySelectorAll('[data-pid],[data-url]'));
  const ids = [...new Set(els.map(el=>el.dataset.pid || el.dataset.url))];
  const need = ids.filter(id => !window.productMetaCache[id]);
  if(need.length){
    try{
      const batch = await fetchBatch(need);
      Object.keys(batch).forEach(k=>{ window.productMetaCache[k] = batch[k]; });
    }catch(e){
      need.forEach(id=>{ window.productMetaCache[id] = { title:id, image:'' }; });
    }
  }
  els.forEach(el=>{
    const id = el.dataset.pid || el.dataset.url;
    const meta = window.productMetaCache[id];
    if(meta && meta.title) el.textContent = meta.title;
  });
}
