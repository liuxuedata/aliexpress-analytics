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

    const todayIso = new Date().toISOString();
    const datesResp = await supabase
      .from('ozon_product_report_wide')
      .select('inserted_at')
      .lte('inserted_at', todayIso)
      .order('inserted_at', { ascending: false });
    if(datesResp.error) throw datesResp.error;
    const dates = [];
    for(const r of datesResp.data || []){
      const d = r.inserted_at && r.inserted_at.slice(0,10);
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

    const select = 'sku,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_posescheniya_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_vykupleno_tovarov';
    const next = new Date(date); next.setDate(next.getDate()+1);
    const curResp = await supabase.from('ozon_product_report_wide').select(select).gte('inserted_at', date).lt('inserted_at', next.toISOString().slice(0,10));
    if(curResp.error) throw curResp.error;
    let prevResp = { data: [] };
    if(prevDate){
      const prevNext = new Date(prevDate); prevNext.setDate(prevNext.getDate()+1);
      prevResp = await supabase.from('ozon_product_report_wide').select(select).gte('inserted_at', prevDate).lt('inserted_at', prevNext.toISOString().slice(0,10));
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
        const u=Number(r.voronka_prodazh_posescheniya_kartochki_tovara)||0; sums.uv+=u;
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
