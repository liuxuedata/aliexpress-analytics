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
    let { from: fromDate, to: toDate } = req.query || {};

    if(!fromDate || !toDate){
      const today = new Date();
      toDate = today.toISOString().slice(0,10);
      fromDate = new Date(today.getTime()-6*86400000).toISOString().slice(0,10);
    }

    const selectCols = 'sku,tovary,period_start,period_end,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,voronka_prodazh_posescheniya_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov';

    let { data, error } = await supabase
      .from('ozon_product_report_wide')
      .select(selectCols)
      .eq('period_start', fromDate)
      .eq('period_end', toDate);
    if(error) throw error;

    if(!data.length){
      const latest = await supabase
        .from('ozon_product_report_wide')
        .select('period_start,period_end')
        .order('period_end', { ascending:false })
        .limit(1);
      if(latest.error) throw latest.error;
      if(latest.data && latest.data.length){
        fromDate = latest.data[0].period_start;
        toDate = latest.data[0].period_end;
        const retry = await supabase
          .from('ozon_product_report_wide')
          .select(selectCols)
          .eq('period_start', fromDate)
          .eq('period_end', toDate);
        if(retry.error) throw retry.error;
        data = retry.data;
      }
    }

    const rows = (data||[]).map(r=>({
      product_id: r.sku,
      product_title: r.tovary,
      exposure: r.voronka_prodazh_pokazy_vsego,
      uv: r.voronka_prodazh_posescheniya_kartochki_tovara,
      pv: r.voronka_prodazh_pokazy_v_poiske_i_kataloge,
      add_to_cart_users: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
      add_to_cart_qty: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
      pay_items: r.voronka_prodazh_vykupleno_tovarov,
      pay_orders: r.voronka_prodazh_zakazano_tovarov,
      pay_buyers: r.voronka_prodazh_vykupleno_tovarov
    }));
    res.json({ok:true, rows, period_start: fromDate, period_end: toDate});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
