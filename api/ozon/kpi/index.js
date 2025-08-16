const { createClient } = require('@supabase/supabase-js');

function supa(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

function fmt(date){ return date.toISOString().slice(0,10); }

module.exports = async function handler(req,res){
  try{
    const { from, to } = req.query || {};
    if(!from || !to) return res.json({ok:false,msg:'missing from/to'});
    const supabase = supa();
    const days = Math.round((new Date(to)-new Date(from))/86400000)+1;
    const prevTo = new Date(new Date(from).getTime()-86400000);
    const prevFrom = new Date(prevTo.getTime() - (days-1)*86400000);
    const select = 'sku,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_posescheniya_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_vykupleno_tovarov';
    const curResp = await supabase.from('ozon_product_report_wide').select(select).eq('period_start', from).eq('period_end', to);
    if(curResp.error) throw curResp.error;
    const prevResp = await supabase.from('ozon_product_report_wide').select(select).eq('period_start', fmt(prevFrom)).eq('period_end', fmt(prevTo));
    if(prevResp.error) throw prevResp.error;
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
