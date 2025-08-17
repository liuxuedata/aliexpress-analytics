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
    let { date, start, end } = req.query || {};

    const RAW_TABLE = process.env.OZON_TABLE_NAME || 'ozon_product_report_wide';
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

    const idOf = r => `${r.sku}@@${r.model||''}`;

    const selectCols = `sku,model,tovary,voronka_prodazh_pozitsiya_v_poiske_i_kataloge,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,uv:${uvCol},voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov`;

    if(start && end){
      const { data, error } = await supabase
        .schema('public')
        .from(TABLE)
        .select(selectCols)
        .gte('den', start)
        .lte('den', end);
      if(error) throw error;
      const map = new Map();
      for(const r of data || []){
        const key = idOf(r);
        if(!map.has(key)){
          map.set(key, {
            product_id: r.sku,
            model: r.model,
            product_title: r.tovary,
            search_rank_sum: 0,
            search_rank_count: 0,
            exposure: 0,
            uv: 0,
            pv: 0,
            add_to_cart_users: 0,
            add_to_cart_qty: 0,
            pay_items: 0,
            pay_orders: 0,
            pay_buyers: 0
          });
        }
        const acc = map.get(key);
        acc.product_title = acc.product_title || r.tovary;
        const sr = Number(r.voronka_prodazh_pozitsiya_v_poiske_i_kataloge);
        if(!isNaN(sr)){
          acc.search_rank_sum += sr;
          acc.search_rank_count++;
        }
        acc.exposure += Number(r.voronka_prodazh_pokazy_vsego)||0;
        acc.uv += Number(r.uv)||0;
        acc.pv += Number(r.voronka_prodazh_pokazy_v_poiske_i_kataloge)||0;
        const atc = Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0;
        acc.add_to_cart_users += atc;
        acc.add_to_cart_qty += atc;
        const payItems = Number(r.voronka_prodazh_vykupleno_tovarov)||0;
        const payOrders = Number(r.voronka_prodazh_zakazano_tovarov)||0;
        acc.pay_items += payItems;
        acc.pay_orders += payOrders;
        acc.pay_buyers += payItems;
      }
      const rows = Array.from(map.values()).map(r=>({
        product_id: r.product_id,
        model: r.model,
        product_title: r.product_title,
        search_rank: r.search_rank_count ? r.search_rank_sum / r.search_rank_count : null,
        exposure: r.exposure,
        uv: r.uv,
        pv: r.pv,
        add_to_cart_users: r.add_to_cart_users,
        add_to_cart_qty: r.add_to_cart_qty,
        pay_items: r.pay_items,
        pay_orders: r.pay_orders,
        pay_buyers: r.pay_buyers
      }));
      return res.json({ok:true, rows, start, end});
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
      return res.json({ok:true, rows:[], date:null, dates});
    }
    const { data, error } = await supabase
      .schema('public')
      .from(TABLE)
      .select(selectCols)
      .eq('den', date);
    if(error) throw error;
    const rows = (data||[]).map(r=>({
      product_id: r.sku,
      model: r.model,
      product_title: r.tovary,
      search_rank: r.voronka_prodazh_pozitsiya_v_poiske_i_kataloge,
      exposure: r.voronka_prodazh_pokazy_vsego,
      uv: r.uv,
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
