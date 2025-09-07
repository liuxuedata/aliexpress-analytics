/*! New Products KPI (auto-install) */
(function(){
  const pad2 = n => (n<10? "0"+n : ""+n);
  const toMMDD = iso => { const d=new Date(iso+"T00:00:00Z"); return pad2(d.getUTCMonth()+1)+pad2(d.getUTCDate()); };

    function guessPlatform(){
      try{
        const s = (document.currentScript && document.currentScript.dataset.platform)||"";
        if (s) return s;
      }catch(e){}
      const p = location.pathname.toLowerCase();
      if (p.includes("index.html") || p.includes("self")) return "self";
      if (p.includes("independent") || p.includes("indep")) return "indep";
      return "managed";
    }

  function findMainTable(){
    const cand = ['#managed-table','#self-table','#detail-table','#data-table','.dataTable','.table','table'];
    for (const sel of cand){
      const el = document.querySelector(sel);
      if (el && el.tagName && el.tagName.toLowerCase()==='table' && el.tBodies && el.tBodies[0] && el.tBodies[0].rows.length) {
        return el;
      }
    }
    const any = Array.from(document.querySelectorAll('table')).find(t => t.tBodies && t.tBodies[0] && t.tBodies[0].rows.length);
    return any || null;
  }

  function detectAndTagProductIdColumn(table){
    const tagged = table.querySelector('[data-col="product_id"]');
    if (tagged){
      const tr = tagged.closest('tr');
      const tdIndex = Array.prototype.indexOf.call(tr.cells, tagged);
      return tdIndex >= 0 ? tdIndex : null;
    }
    const head = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0] : null;
    let idx = null;
    if (head){
      const texts = ["商品id","product id","product_id","id"];
      for (let i=0;i<head.cells.length;i++){
        const t = (head.cells[i].textContent||"").trim().toLowerCase();
        if (texts.some(x => t.includes(x))) { idx = i; break; }
      }
    }
    if (idx !== null){
      const rows = table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
      rows.forEach(tr => {
        const td = tr.cells[idx];
        if (td) td.setAttribute("data-col","product_id");
      });
      return idx;
    }
    return null;
  }

  async function fetchNewProducts(platform, periodEndISO /* may be null */){
    const qs = new URLSearchParams({ platform });
    if (periodEndISO){ qs.set('from',periodEndISO); qs.set('to',periodEndISO); }
    if (platform === 'indep'){
      try{
        const urlParams = new URLSearchParams(window.location.search);
        let site = urlParams.get('site') || '';
        if (site && typeof normalizeSite === 'function'){
          site = normalizeSite(site);
        }
        if (site) qs.set('site', site);
      }catch(e){/* ignore */}
    }
    const r = await fetch('/api/new-products?' + qs.toString());
    const j = await r.json();
    if (!j.ok) throw new Error(j.msg||'fetch error');
    return j;
  }

  function ensureKpiRow(target){
    let row = document.querySelector('.kpi-row');
    if (row) return row;
    row = document.createElement('div');
    row.className = 'kpi-row kpi-inserted';
    if (target && target.parentNode){
      target.parentNode.insertBefore(row, target);
    } else {
      document.body.insertBefore(row, document.body.firstChild);
    }
    return row;
  }

  function makeKpiCard(idPrefix){
    const box = document.createElement('div');
    box.className = 'kpi-card clickable';
    box.id = idPrefix;
    const label = document.createElement('span');
    label.textContent = '本周期新品数：';
    const count = document.createElement('span');
    count.id = idPrefix + '-count';
    count.className = 'kpi-count';
    count.textContent = '--';
    const clear = document.createElement('a');
    clear.id = 'clear-filter-' + idPrefix;
    clear.className = 'kpi-clear';
    clear.textContent = '清除筛选';
    box.appendChild(label);
    box.appendChild(count);
    box.appendChild(clear);
    return { box, count, clear };
  }

  function hasDataTablesApi(table){
    try{
      return !!(window.jQuery && jQuery.fn && jQuery.fn.dataTable && jQuery.fn.dataTable.isDataTable && jQuery.fn.dataTable.isDataTable(table));
    }catch(e){ return false; }
  }

  function filterTableByProductIds(table, productIdSet, opts={}){
    const { productIdColumnIndex=null, productIdCellSelector='[data-col="product_id"]' } = opts;
    if (hasDataTablesApi(table)){
      const dt = jQuery(table).DataTable();
      const filterFn = (settings, data, dataIndex) => {
        let pid = "";
        if (productIdColumnIndex !== null){
          pid = (data[productIdColumnIndex]||"").trim();
        } else {
          const rowNode = dt.row(dataIndex).node();
          const cell = rowNode && rowNode.querySelector(productIdCellSelector);
          pid = cell ? cell.textContent.trim() : (data[0]||"").trim();
        }
        const m = pid.match(/(\d{6,})/g);
        if (m && m.length) pid = m[m.length-1];
        return productIdSet.has(pid);
      };
      const ext = jQuery.fn.dataTable.ext;
      const key = table.getAttribute('id') || 'dt-' + Math.random().toString(36).slice(2);
      if (!table.getAttribute('id')) table.setAttribute('id', key);
      ext._newProductsFilters = ext._newProductsFilters || new Map();
      ext.search.push(filterFn);
      dt.draw();
      return () => {
        const pos = ext.search.findIndex(f => f === filterFn);
        if (pos > -1) ext.search.splice(pos, 1);
        dt.draw();
      };
    }
    const rows = table.tBodies && table.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
    const original = new Map();
    rows.forEach(tr => {
      const td = (productIdColumnIndex !== null) ? tr.cells[productIdColumnIndex] :
                 (tr.querySelector(productIdCellSelector) || tr.cells[0]);
      const pid = td ? td.textContent.trim() : "";
      if (!original.has(tr)) original.set(tr, tr.style.display);
      tr.style.display = productIdSet.has(pid) ? "" : "none";
    });
    return () => { for (const [tr, disp] of original) tr.style.display = disp; };
  }

    function currentPeriodFromGlobals(platform){
      try{
        if (platform==='managed' && window.currentManagedPeriodEnd) return window.currentManagedPeriodEnd;
        if (platform==='self' && window.currentSelfPeriodEnd) return window.currentSelfPeriodEnd;
        if (platform==='indep' && window.currentIndepPeriodEnd) return window.currentIndepPeriodEnd;
      }catch(e){}
      return null;
    }

  async function bootstrap(){
    const platform = guessPlatform();
    const table = findMainTable();
    if (!table) return;
    const pidIdx = detectAndTagProductIdColumn(table);

    const host = ensureKpiRow(table);
    const idPrefix = platform==='self' ? 'kpi-new-self' : 'kpi-new-managed';
    const { box, count, clear } = makeKpiCard(idPrefix);
    host.appendChild(box);

    let periodEndISO = currentPeriodFromGlobals(platform);
    let data;
    try{
      data = await fetchNewProducts(platform, periodEndISO);
      count.textContent = data.new_count;
      count.title = data.range ? (data.range.from===data.range.to ? '周期：'+data.range.from : `周期：${data.range.from} ~ ${data.range.to}`) : '';
    }catch(e){
      console.error('[New KPI] fetch error:', e);
      count.textContent = '0';
    }

    let clearFilter = null;
    box.addEventListener('click', () => {
      if (!data || !Array.isArray(data.items) || !data.items.length) return;
      const ids = new Set(data.items.map(x => String(x.product_id)));
      clearFilter = filterTableByProductIds(table, ids, { productIdColumnIndex: pidIdx, productIdCellSelector: '[data-col="product_id"]' });
      clear.style.display = 'inline';
    });

    clear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (clearFilter) clearFilter();
      clear.style.display = 'none';
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();