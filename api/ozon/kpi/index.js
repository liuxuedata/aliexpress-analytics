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

    const idOf = r => `${r.sku}@@${r.model||''}`;

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
        const cartProds=new Set();
        const payProds=new Set();
        const displayProds=new Set();
        for(const r of rows){
          const id=idOf(r);
          prodSet.add(id);
          const e=Number(r.voronka_prodazh_pokazy_vsego)||0; sums.exposure+=e; if(e>0) displayProds.add(id);
          const u=Number(r.uv)||0; sums.uv+=u;
          const c=Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0; sums.cart+=c; if(c>0) cartProds.add(id);
          const p=Number(r.voronka_prodazh_zakazano_tovarov)||0; sums.pay+=p; if(p>0) payProds.add(id);
        }
        return {sums, prodSet, cartProds, payProds, displayProds, rows};
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
        const id=idOf(r);
        if(newIdSet.has(id) && !newMap.has(id)){
          newMap.set(id,{sku:r.sku,model:r.model,title:r.tovary});
        }
      }
      const newProducts=[...newMap.values()];

      const allCurResp = await supabase
        .schema('public')
        .from(TABLE)
        .select('sku,model')
        .lte('den', end)
        .limit(100000);
      if(allCurResp.error) throw allCurResp.error;
      const allPrevResp = await supabase
        .schema('public')
        .from(TABLE)
        .select('sku,model')
        .lte('den', prevEnd.toISOString().slice(0,10))
        .limit(100000);
      if(allPrevResp.error) throw allPrevResp.error;
      const allCurSet = new Set((allCurResp.data||[]).map(idOf));
      const allPrevSet = new Set((allPrevResp.data||[]).map(idOf));

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
          cart_product_total:{current:cur.cartProds.size, previous:prev.cartProds.size},
          pay_product_total:{current:cur.payProds.size, previous:prev.payProds.size},
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
      const cartProds=new Set();
      const payProds=new Set();
      const displayProds=new Set();
      for(const r of rows){
        const id=idOf(r);
        prodSet.add(id);
        const e=Number(r.voronka_prodazh_pokazy_vsego)||0; sums.exposure+=e; if(e>0) displayProds.add(id);
        const u=Number(r.uv)||0; sums.uv+=u;
        const c=Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0; sums.cart+=c; if(c>0) cartProds.add(id);
        const p=Number(r.voronka_prodazh_zakazano_tovarov)||0; sums.pay+=p; if(p>0) payProds.add(id);
      }
      return {sums, prodSet, cartProds, payProds, displayProds, rows};
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
      const id=idOf(r);
      if(newIdSet.has(id) && !newMap.has(id)){
        newMap.set(id,{sku:r.sku,model:r.model,title:r.tovary});
      }
    }
    const newProducts=[...newMap.values()];

    const allCurResp = await supabase
      .schema('public')
      .from(TABLE)
      .select('sku,model')
      .lte('den', date)
      .limit(100000);
    if(allCurResp.error) throw allCurResp.error;
    let allPrevSet = new Set();
    if(prevDate){
      const allPrevResp = await supabase
        .schema('public')
        .from(TABLE)
        .select('sku,model')
        .lte('den', prevDate)
        .limit(100000);
      if(allPrevResp.error) throw allPrevResp.error;
      allPrevSet = new Set((allPrevResp.data||[]).map(idOf));
    }
    const allCurSet = new Set((allCurResp.data||[]).map(idOf));

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
        cart_product_total:{current:cur.cartProds.size, previous:prev.cartProds.size},
        pay_product_total:{current:cur.payProds.size, previous:prev.payProds.size},
        new_product_total:newProducts.length,
        new_products:newProducts
      }
    });
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
