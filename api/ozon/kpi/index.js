const { createClient } = require('@supabase/supabase-js');

function supa(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async function handler(req,res){
  try{
    const supabase = supa();
    let { date } = req.query || {};

    async function refresh(){
      const { error } = await supabase.rpc('refresh_ozon_schema_cache');
      if(error) console.error('schema cache refresh failed:', error.message);
      await new Promise(r=>setTimeout(r,1000));
    }

    async function getCols(){
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
      return (colData||[]).map(c=>c.column_name);
    }

    const tableCols = await getCols();
    const uvCandidates = [
      'voronka_prodazh_uv_s_prosmotrom_kartochki_tovara',
      'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara',
      'voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara'.slice(0,63)
    ];
    const uvCol = uvCandidates.find(c=>tableCols.includes(c)) || uvCandidates[0];

    const datesResp = await supabase
      .from('public.ozon_product_report_wide')
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

    const select = `sku,tovary,voronka_prodazh_pokazy_vsego,${uvCol} as uv,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_vykupleno_tovarov`;
    const curResp = await supabase.from('public.ozon_product_report_wide').select(select).eq('den', date);
    if(curResp.error) throw curResp.error;
    let prevResp = { data: [] };
    if(prevDate){
      prevResp = await supabase.from('public.ozon_product_report_wide').select(select).eq('den', prevDate);
      if(prevResp.error) throw prevResp.error;
    }
    function agg(rows){
      const sums={exposure:0,uv:0,cart:0,pay:0};
      const skuSet=new Set();
      const cartSkus=new Set();
      const paySkus=new Set();
      for(const r of rows){
        skuSet.add(r.sku);
        const e=Number(r.voronka_prodazh_pokazy_vsego)||0; sums.exposure+=e;
        const u=Number(r.uv)||0; sums.uv+=u;
        const c=Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0; sums.cart+=c; if(c>0) cartSkus.add(r.sku);
        const p=Number(r.voronka_prodazh_vykupleno_tovarov)||0; sums.pay+=p; if(p>0) paySkus.add(r.sku);
      }
      return {sums, skuSet, cartSkus, paySkus, rows};
    }
    const cur=agg(curResp.data||[]);
    const prev=agg(prevResp.data||[]);
    const visitorRate = cur.sums.exposure ? cur.sums.uv / cur.sums.exposure : 0;
    const visitorRatePrev = prev.sums.exposure ? prev.sums.uv / prev.sums.exposure : 0;
    const cartRate = cur.sums.uv ? cur.sums.cart / cur.sums.uv : 0;
    const cartRatePrev = prev.sums.uv ? prev.sums.cart / prev.sums.uv : 0;
    const payRate = cur.sums.uv ? cur.sums.pay / cur.sums.uv : 0;
    const payRatePrev = prev.sums.uv ? prev.sums.pay / prev.sums.uv : 0;
    const newSkus=[...cur.skuSet].filter(s=>!prev.skuSet.has(s));
    const newProducts=cur.rows.filter(r=>newSkus.includes(r.sku)).map(r=>({sku:r.sku,title:r.tovary}));
    res.json({
      ok:true,
      date,
      dates,
      metrics:{
        visitor_rate:{current:visitorRate, previous:visitorRatePrev},
        cart_rate:{current:cartRate, previous:cartRatePrev},
        pay_rate:{current:payRate, previous:payRatePrev},
        product_total:{current:cur.skuSet.size, previous:prev.skuSet.size},
        cart_product_total:{current:cur.cartSkus.size, previous:prev.cartSkus.size},
        pay_product_total:{current:cur.paySkus.size, previous:prev.paySkus.size},
        new_product_total:newProducts.length,
        new_products:newProducts
      }
    });
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
