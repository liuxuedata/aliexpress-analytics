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
      .from('public.ozon_product_report_wide')
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
      return res.json({ok:true, rows:[], date:null, dates});
    }

    const selectCols = 'sku,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,voronka_prodazh_posescheniya_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov';

    const next = new Date(date);
    next.setDate(next.getDate()+1);
    const to = next.toISOString().slice(0,10);
    const { data, error } = await supabase
      .from('public.ozon_product_report_wide')
      .select(selectCols)
      .gte('inserted_at', date)
      .lt('inserted_at', to);
    if(error) throw error;

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
    res.json({ok:true, rows, date, dates});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
