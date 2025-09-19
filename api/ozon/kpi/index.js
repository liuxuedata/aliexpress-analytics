const { createClient } = require('@supabase/supabase-js');

function supa(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeTableName(name, fallback = 'ozon_product_report_wide'){
  let t = (name || fallback).trim();
  t = t.replace(/^"+|"+$/g, '');
  t = t.replace(/^public\./i, '');
  return t;
}

function cleanText(value){
  if(value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : String(value);
}

function productKey(row){
  if(!row) return '';
  const sku = cleanText(row.product_id || row.sku || row.offer_id || '');
  const model = cleanText(row.model || '');
  if(sku) return `${sku}@@${model || ''}`;
  const title = cleanText(row.tovary || row.product_title || '');
  if(title) return `title:${title}`;
  return JSON.stringify({ sku, model, title });
}

module.exports = async function handler(req,res){
  try{
    const supabase = supa();
    let { date, start, end, store_id } = req.query || {};

    const RAW_TABLE = process.env[`OZON_TABLE_NAME_${store_id}`] || process.env.OZON_TABLE_NAME || 'ozon_product_report_wide';
    const TABLE = normalizeTableName(RAW_TABLE);

    async function refresh(){
      const { error } = await supabase.rpc('refresh_ozon_schema_cache');
      if(error) console.error('schema cache refresh failed:', error.message);
      await new Promise(r=>setTimeout(r,1000));
    }

    async function getCols(){
      let colData;
      for(let attempt=0;attempt<2;attempt++){
        const { data, error } = await supabase
          .rpc('get_public_columns', { table_name: TABLE });
        if(!error){ colData = data; break; }
        if(/schema cache/i.test(error.message)){ await refresh(); continue; }
        throw error;
      }
      if(!colData) throw new Error('unable to load column metadata');
      return (colData||[]).map(c=>c.column_name);
    }

    const tableCols = await getCols();
    const uvCandidates = [
      'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',
      'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara',
      'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara'.slice(0,63)
    ];
    const uvCol = uvCandidates.find(c=>tableCols.includes(c)) || uvCandidates[0];

    async function fetchAllProductSet(until){
      const PAGE = 1000;
      const set = new Set();
      for(let from=0;;from+=PAGE){
        const { data, error } = await supabase
          .schema('public')
          .from(TABLE)
          .select('sku,model')
          .lte('den', until)
          .order('den', { ascending: true })
          .range(from, from+PAGE-1);
        if(error) throw error;
        for(const r of data||[]) set.add(productKey(r));
        if(!data || data.length < PAGE) break;
      }
      return set;
    }

    const select = `sku,model,tovary,voronka_prodazh_pokazy_vsego,uv:${uvCol},voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov`;

    if(start && end){
      const curResp = await supabase.schema('public').from(TABLE).select(select).gte('den', start).lte('den', end);
      if(curResp.error) throw curResp.error;
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const days = Math.floor(diffMs / 86400000) + 1;
      const prevEnd = new Date(new Date(start).getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - (days-1)*86400000);
      const prevResp = await supabase.schema('public').from(TABLE).select(select).gte('den', prevStart.toISOString().slice(0,10)).lte('den', prevEnd.toISOString().slice(0,10));
      if(prevResp.error) throw prevResp.error;
      function agg(rows){
        const sums={exposure:0,uv:0,cart:0,pay:0};
        const prodSet=new Set();
        const displayProds=new Set();
        const cartPositive=new Set();
        const payPositive=new Set();
        for(const r of rows){
          const key=productKey(r);
          prodSet.add(key);
          const e=Number(r.voronka_prodazh_pokazy_vsego)||0; sums.exposure+=e; if(e>0) displayProds.add(key);
          const u=Number(r.uv)||0; sums.uv+=u;
          const c=Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0; sums.cart+=c; if(c>0) cartPositive.add(key);
          const p=Number(r.voronka_prodazh_zakazano_tovarov)||0; sums.pay+=p; if(p>0) payPositive.add(key);
        }
        return {sums, prodSet, cartPositive, payPositive, displayProds, rows};
      }
      const cur=agg(curResp.data||[]);
      const prev=agg(prevResp.data||[]);
      const visitorRate = cur.sums.exposure ? cur.sums.uv / cur.sums.exposure : 0;
      const visitorRatePrev = prev.sums.exposure ? prev.sums.uv / prev.sums.exposure : 0;
      const cartRate = cur.sums.uv ? cur.sums.cart / cur.sums.uv : 0;
      const cartRatePrev = prev.sums.uv ? prev.sums.cart / prev.sums.uv : 0;
      const payRate = cur.sums.cart ? cur.sums.pay / cur.sums.cart : 0;
      const payRatePrev = prev.sums.cart ? prev.sums.pay / prev.sums.cart : 0;
      const newIds=[...cur.prodSet].filter(id=>!prev.prodSet.has(id));
      const newIdSet=new Set(newIds);
      const newMap=new Map();
      for(const r of cur.rows){
        const key=productKey(r);
        if(newIdSet.has(key) && !newMap.has(key)){
          newMap.set(key,{sku:r.sku,model:r.model,title:r.tovary});
        }
      }
      const newProducts=[...newMap.values()];

      const allCurSet = await fetchAllProductSet(end);
      const allPrevSet = await fetchAllProductSet(prevEnd.toISOString().slice(0,10));

      return res.json({
        ok:true,
        start,
        end,
        metrics:{
          visitor_rate:{current:visitorRate, previous:visitorRatePrev},
          cart_rate:{current:cartRate, previous:cartRatePrev},
          pay_rate:{current:payRate, previous:payRatePrev},
          display_product_total:{current:cur.displayProds.size, previous:prev.displayProds.size},
          product_total:{current:allCurSet.size, previous:allPrevSet.size},
          cart_product_total:{current:cur.cartPositive.size, previous:prev.cartPositive.size},
          pay_product_total:{current:cur.payPositive.size, previous:prev.payPositive.size},
          new_product_total:newProducts.length,
          new_products:newProducts
        }
      });
    }

    const datesResp = await supabase
      .schema('public')
      .from(TABLE)
      .select('den')
      .not('den', 'is', null)
      .order('den', { ascending: false });
    if(datesResp.error) throw datesResp.error;
    const dates = [];
    for(const r of datesResp.data || []){
      const d = r.den;
      if(d && !dates.includes(d)) dates.push(d);
    }
    if(!date && dates.length){
      date = dates[0];
    }
    if(!date){
      return res.json({ok:true, metrics:null, date:null, dates});
    }
    const curIndex = dates.indexOf(date);
    const prevDate = dates[curIndex+1] || null;
    const curResp = await supabase.schema('public').from(TABLE).select(select).eq('den', date);
    if(curResp.error) throw curResp.error;
    let prevResp = { data: [] };
    if(prevDate){
      prevResp = await supabase.schema('public').from(TABLE).select(select).eq('den', prevDate);
      if(prevResp.error) throw prevResp.error;
    }
    function agg(rows){
      const sums={exposure:0,uv:0,cart:0,pay:0};
      const prodSet=new Set();
      const displayProds=new Set();
      const cartPositive=new Set();
      const payPositive=new Set();
      for(const r of rows){
        const key=productKey(r);
        prodSet.add(key);
        const e=Number(r.voronka_prodazh_pokazy_vsego)||0; sums.exposure+=e; if(e>0) displayProds.add(key);
        const u=Number(r.uv)||0; sums.uv+=u;
        const c=Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0; sums.cart+=c; if(c>0) cartPositive.add(key);
        const p=Number(r.voronka_prodazh_zakazano_tovarov)||0; sums.pay+=p; if(p>0) payPositive.add(key);
      }
      return {sums, prodSet, cartPositive, payPositive, displayProds, rows};
    }
    const cur=agg(curResp.data||[]);
    const prev=agg(prevResp.data||[]);
    const visitorRate = cur.sums.exposure ? cur.sums.uv / cur.sums.exposure : 0;
    const visitorRatePrev = prev.sums.exposure ? prev.sums.uv / prev.sums.exposure : 0;
    const cartRate = cur.sums.uv ? cur.sums.cart / cur.sums.uv : 0;
    const cartRatePrev = prev.sums.uv ? prev.sums.cart / prev.sums.uv : 0;
    const payRate = cur.sums.cart ? cur.sums.pay / cur.sums.cart : 0;
    const payRatePrev = prev.sums.cart ? prev.sums.pay / prev.sums.cart : 0;
    const newIds=[...cur.prodSet].filter(id=>!prev.prodSet.has(id));
    const newIdSet=new Set(newIds);
    const newMap=new Map();
    for(const r of cur.rows){
      const key=productKey(r);
      if(newIdSet.has(key) && !newMap.has(key)){
        newMap.set(key,{sku:r.sku,model:r.model,title:r.tovary});
      }
    }
    const newProducts=[...newMap.values()];

    const allCurSet = await fetchAllProductSet(date);
    let allPrevSet = new Set();
    if(prevDate){
      allPrevSet = await fetchAllProductSet(prevDate);
    }

    res.json({
      ok:true,
      date,
      dates,
      metrics:{
        visitor_rate:{current:visitorRate, previous:visitorRatePrev},
        cart_rate:{current:cartRate, previous:cartRatePrev},
        pay_rate:{current:payRate, previous:payRatePrev},
        display_product_total:{current:cur.displayProds.size, previous:prev.displayProds.size},
        product_total:{current:allCurSet.size, previous:allPrevSet.size},
        cart_product_total:{current:cur.cartPositive.size, previous:prev.cartPositive.size},
        pay_product_total:{current:cur.payPositive.size, previous:prev.payPositive.size},
        new_product_total:newProducts.length,
        new_products:newProducts
      }
    });
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
