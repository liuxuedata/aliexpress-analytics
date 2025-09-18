const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { parseOzonResponse } = require('../../../lib/ozon-orders');
const { createProductMetadataLoader, normalizeSku } = require('../../../lib/ozon-product-catalog');

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

function getOzonCredentials(){
  const { OZON_CLIENT_ID, OZON_API_KEY } = process.env;
  if(!OZON_CLIENT_ID || !OZON_API_KEY){
    throw new Error('Missing OZON_CLIENT_ID or OZON_API_KEY');
  }
  return { clientId: OZON_CLIENT_ID, apiKey: OZON_API_KEY };
}

module.exports = async function handler(req,res){
  try{
    const supabase = supa();
    let { start, end, product_id, store_id } = req.query || {};
    if(!start || !end || !product_id){
      return res.json({ok:false, msg:'missing params'});
    }

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

    const selectCols = `den,sku,model,tovary,voronka_prodazh_pokazy_vsego,voronka_prodazh_pokazy_v_poiske_i_kataloge,uv:${uvCol},voronka_prodazh_dobavleniya_v_korzinu_vsego,voronka_prodazh_zakazano_tovarov,voronka_prodazh_vykupleno_tovarov`;

    const { data, error } = await supabase
      .schema('public')
      .from(TABLE)
      .select(selectCols)
      .eq('sku', product_id)
      .gte('den', start)
      .lte('den', end)
      .order('den', { ascending: true });
    if(error) throw error;

    const rows = (data||[]).map(r=>({
      date: r.den,
      product_id: r.sku,
      model: r.model,
      product_title: r.tovary,
      exposure: Number(r.voronka_prodazh_pokazy_vsego)||0,
      uv: Number(r.uv)||0,
      pv: Number(r.voronka_prodazh_pokazy_v_poiske_i_kataloge)||0,
      add_to_cart_users: Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0,
      pay_items: Number(r.voronka_prodazh_vykupleno_tovarov)||0,
      pay_orders: Number(r.voronka_prodazh_zakazano_tovarov)||0,
      pay_buyers: Number(r.voronka_prodazh_vykupleno_tovarov)||0
    }));
    let metadata = null;
    try{
      const creds = getOzonCredentials();
      const loader = createProductMetadataLoader({
        supabase,
        fetchImpl: fetch,
        creds,
        parseOzonResponse
      });
      const sku = normalizeSku(product_id);
      if(sku){
        const map = await loader([sku]);
        if(map instanceof Map && map.has(sku)){
          metadata = { ...map.get(sku), sku };
        }
      }
    }catch(error){
      console.warn('[ozon] Skip product metadata enrichment:', error.message);
    }

    res.json({ok:true, rows, metadata});
  }catch(e){
    res.json({ok:false, msg:e.message});
  }
};
