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
    const { data, error } = await supabase.from('ozon_product_report_wide').select(
      'sku,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,voronka_prodazh_posescheniya_kartochki_tovara,voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov'
    );
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
    res.json({ok:true, rows});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
