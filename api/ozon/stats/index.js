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
      return res.json({ok:true, rows:[], date:null, dates});
    }

    const selectCols = 'sku,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov';

    const { data, error } = await supabase
      .from('public.ozon_product_report_wide')
      .select(selectCols)
      .eq('den', date);
    if(error) throw error;

    const rows = (data||[]).map(r=>({
      product_id: r.sku,
      product_title: r.tovary,
      exposure: r.voronka_prodazh_pokazy_vsego,
      uv: r.voronka_prodazh_unikalnye_posetiteli_s_prosmotrom_kartochki_tovara,
      pv: r.voronka_prodazh_pokazy_v_poiske_i_kataloge,
      add_to_cart_users: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
      add_to_cart_qty: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
      pay_items: r.voronka_prodazh_vykupleno_tovarov,
      pay_orders: r.voronka_prodazh_zakazano_tovarov,
      pay_buyers: r.voronka_prodazh_vykupleno_tovarov
    }));
    res.json({ok:true, rows, date, dates});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
