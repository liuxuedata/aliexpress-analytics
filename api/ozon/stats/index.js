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

async function enrichWithMetadata(supabase, rows){
  if(!Array.isArray(rows) || !rows.length) return rows;
  let loader;
  try{
    const creds = getOzonCredentials();
    loader = createProductMetadataLoader({
      supabase,
      fetchImpl: fetch,
      creds,
      parseOzonResponse
    });
  }catch(error){
    console.warn('[ozon] Skip metadata enrichment:', error.message);
    return rows;
  }

  const skus = rows
    .map(r => normalizeSku(r?.product_id || r?.sku))
    .filter(Boolean);
  if(!skus.length) return rows;

  let metadata = new Map();
  try{
    metadata = await loader(Array.from(new Set(skus)));
  }catch(error){
    console.warn('[ozon] Failed to load metadata for stats:', error.message);
    return rows;
  }

  if(!(metadata instanceof Map) || !metadata.size){
    return rows;
  }

  return rows.map(row => {
    const sku = normalizeSku(row?.product_id || row?.sku);
    const meta = sku ? metadata.get(sku) : null;
    const title = row?.product_title && typeof row.product_title === 'string'
      ? row.product_title.trim()
      : row?.product_title;
    const resolvedTitle = title || meta?.name || sku;
    return {
      ...row,
      product_title: resolvedTitle,
      product_image: meta?.image || row?.product_image || null
    };
  });
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

    const selectCols = [
      'sku',
      'model',
      'tovary',
      'voronka_prodazh_pokazy_vsego',
      'voronka_prodazh_pokazy_v_poiske_i_kataloge',
      'voronka_prodazh_pokazy_na_kartochke_tovara',
      'voronka_prodazh_unikalnye_posetiteli_vsego',
      'voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge',
      `voronka_prodazh_uv_s_prosmotrom_kartochki_tovara:${uvCol}`,
      'voronka_prodazh_dobavleniya_v_korzinu_vsego',
      'voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu',
      'voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu',
      'voronka_prodazh_zakazano_tovarov',
      'prodazhi_zakazano_na_summu'
    ].join(',');

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
            voronka_prodazh_pokazy_vsego: 0,
            voronka_prodazh_pokazy_v_poiske_i_kataloge: 0,
            voronka_prodazh_pokazy_na_kartochke_tovara: 0,
            voronka_prodazh_unikalnye_posetiteli_vsego: 0,
            // 在搜索或目录中浏览过的独立访客
            voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge: 0,
            voronka_prodazh_uv_s_prosmotrom_kartochki_tovara: 0,
            voronka_prodazh_dobavleniya_v_korzinu_vsego: 0,
            voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu: 0,
            voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu: 0,
            voronka_prodazh_zakazano_tovarov: 0,
            prodazhi_zakazano_na_summu: 0
          });
        }
        const acc = map.get(key);
        acc.product_title = acc.product_title || r.tovary;
        acc.voronka_prodazh_pokazy_vsego += Number(r.voronka_prodazh_pokazy_vsego)||0;
        acc.voronka_prodazh_pokazy_v_poiske_i_kataloge += Number(r.voronka_prodazh_pokazy_v_poiske_i_kataloge)||0;
        acc.voronka_prodazh_pokazy_na_kartochke_tovara += Number(r.voronka_prodazh_pokazy_na_kartochke_tovara)||0;
        acc.voronka_prodazh_unikalnye_posetiteli_vsego += Number(r.voronka_prodazh_unikalnye_posetiteli_vsego)||0;
        acc.voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge += Number(r.voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge)||0;
        acc.voronka_prodazh_uv_s_prosmotrom_kartochki_tovara += Number(r.voronka_prodazh_uv_s_prosmotrom_kartochki_tovara)||0;
        acc.voronka_prodazh_dobavleniya_v_korzinu_vsego += Number(r.voronka_prodazh_dobavleniya_v_korzinu_vsego)||0;
        acc.voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu += Number(r.voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu)||0;
        acc.voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu += Number(r.voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu)||0;
        acc.voronka_prodazh_zakazano_tovarov += Number(r.voronka_prodazh_zakazano_tovarov)||0;
        acc.prodazhi_zakazano_na_summu += Number(r.prodazhi_zakazano_na_summu)||0;
      }
      let rows = Array.from(map.values()).map(r=>({
        product_id: r.product_id,
        model: r.model,
        product_title: r.product_title,
        voronka_prodazh_pokazy_vsego: r.voronka_prodazh_pokazy_vsego,
        voronka_prodazh_pokazy_v_poiske_i_kataloge: r.voronka_prodazh_pokazy_v_poiske_i_kataloge,
        voronka_prodazh_pokazy_na_kartochke_tovara: r.voronka_prodazh_pokazy_na_kartochke_tovara,
        voronka_prodazh_unikalnye_posetiteli_vsego: r.voronka_prodazh_unikalnye_posetiteli_vsego,
        voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge: r.voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge,
        voronka_prodazh_uv_s_prosmotrom_kartochki_tovara: r.voronka_prodazh_uv_s_prosmotrom_kartochki_tovara,
        voronka_prodazh_dobavleniya_v_korzinu_vsego: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
        voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu: r.voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu,
        voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu: r.voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu,
        voronka_prodazh_zakazano_tovarov: r.voronka_prodazh_zakazano_tovarov,
        prodazhi_zakazano_na_summu: r.prodazhi_zakazano_na_summu
      }));
      rows = await enrichWithMetadata(supabase, rows);
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
    let rows = (data||[]).map(r=>({
      product_id: r.sku,
      model: r.model,
      product_title: r.tovary,
      voronka_prodazh_pokazy_vsego: r.voronka_prodazh_pokazy_vsego,
      voronka_prodazh_pokazy_v_poiske_i_kataloge: r.voronka_prodazh_pokazy_v_poiske_i_kataloge,
      voronka_prodazh_pokazy_na_kartochke_tovara: r.voronka_prodazh_pokazy_na_kartochke_tovara,
      voronka_prodazh_unikalnye_posetiteli_vsego: r.voronka_prodazh_unikalnye_posetiteli_vsego,
      // 在搜索或目录中浏览过的独立访客
      voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge: r.voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge,
      voronka_prodazh_uv_s_prosmotrom_kartochki_tovara: r.voronka_prodazh_uv_s_prosmotrom_kartochki_tovara,
      voronka_prodazh_dobavleniya_v_korzinu_vsego: r.voronka_prodazh_dobavleniya_v_korzinu_vsego,
      voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu: r.voronka_prodazh_dobavleniya_iz_poiska_i_kataloge_v_korzinu,
      voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu: r.voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu,
      voronka_prodazh_zakazano_tovarov: r.voronka_prodazh_zakazano_tovarov,
      prodazhi_zakazano_na_summu: r.prodazhi_zakazano_na_summu
    }));
    rows = await enrichWithMetadata(supabase, rows);
    res.json({ok:true, rows, date, dates});
  }catch(e){
    res.json({ok:false,msg:e.message});
  }
};
