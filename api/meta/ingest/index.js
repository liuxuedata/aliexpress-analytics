// /api/meta/ingest/index.js
// Ingest Facebook (Meta) Ads export into staging (fb_raw) and aggregated fact table.
// Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY

const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable').default;
const XLSX = require('xlsx');
const { randomUUID } = require('crypto');
const { parseDay } = require('../../lib/date');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function toNumber(v) {
  if (v === null || v === undefined || v === '' || v === '--') return 0;
  let s = String(v).trim();
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function canon(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Use POST with multipart/form-data' });
    return;
  }

  const form = formidable({ multiples: false, keepExtensions: true });

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err); else resolve({ fields, files });
      });
    });
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploaded) throw new Error('No file uploaded. Use field name "file".');
    const filePath = uploaded.filepath || uploaded.path;
    if (!filePath) throw new Error('Upload failed: file path missing.');

    const site = String(fields.site || '').trim();
    if (!site) throw new Error('Missing form field "site"');
    const batchId = randomUUID();

    const wb = XLSX.readFile(filePath, { raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const headerCanon = header.map(canon);
    const col = (...names) => {
      for (const n of names) {
        const idx = headerCanon.indexOf(canon(n));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const cDate = col('date', 'day', 'reportingstarts');
    const cCampaignId = col('campaignid');
    const cCampaignName = col('campaignname');
    const cAdsetId = col('adsetid', 'adsetid_');
    const cAdsetName = col('adsetname', 'adsetname_');
    const cAdId = col('adid');
    const cAdName = col('adname');
    const cImpressions = col('impressions');
    const cClicks = col('linkclicks', 'clicks');
    const cSpend = col('amountspent', 'spend');
    const cCurrency = col('currency');
    const cAtc = col('addtocart', 'addtocarttotal', 'addtocartactions');
    const cIc = col('initiatecheckout');
    const cPurchase = col('purchases');

    const rawRows = [];
    const aggMap = new Map();
    const campaigns = new Map();
    const adsets = new Map();
    const ads = new Map();

    for (const r of dataRows) {
      const day = parseDay(r[cDate]);
      if (!day) continue;
      const dayStr = day.toISOString().slice(0, 10);
      const campaignId = String(r[cCampaignId] || '').trim();
      const adsetId = String(r[cAdsetId] || '').trim();
      const adId = String(r[cAdId] || '').trim();
      const payload = {
        batch_id: batchId,
        date: dayStr,
        campaign_id: campaignId || null,
        campaign_name: String(r[cCampaignName] || '').trim() || null,
        adset_id: adsetId || null,
        adset_name: String(r[cAdsetName] || '').trim() || null,
        ad_id: adId || null,
        ad_name: String(r[cAdName] || '').trim() || null,
        currency: cCurrency >= 0 ? String(r[cCurrency] || '').trim() : null,
        impressions: cImpressions >= 0 ? toNumber(r[cImpressions]) : 0,
        clicks: cClicks >= 0 ? toNumber(r[cClicks]) : 0,
        spend: cSpend >= 0 ? toNumber(r[cSpend]) : 0,
        add_to_cart: cAtc >= 0 ? toNumber(r[cAtc]) : 0,
        initiate_checkout: cIc >= 0 ? toNumber(r[cIc]) : 0,
        purchases: cPurchase >= 0 ? toNumber(r[cPurchase]) : 0,
      };
      payload.cpc = payload.clicks ? payload.spend / payload.clicks : null;
      payload.cpm = payload.impressions ? (payload.spend / payload.impressions) * 1000 : null;
      payload.ctr = payload.impressions ? (payload.clicks / payload.impressions) : null;

      rawRows.push({ site_id: site, channel_id: 'meta_ads', payload });

      if (campaignId) campaigns.set(campaignId, {
        campaign_id: campaignId,
        site_id: site,
        campaign_name: payload.campaign_name || null,
      });
      if (adsetId) adsets.set(adsetId, {
        adset_id: adsetId,
        site_id: site,
        campaign_id: campaignId || null,
        adset_name: payload.adset_name || null,
      });
      if (adId) ads.set(adId, {
        ad_id: adId,
        site_id: site,
        adset_id: adsetId || null,
        ad_name: payload.ad_name || null,
      });

      const key = [dayStr, campaignId, adsetId, adId].join('|');
      if (!aggMap.has(key)) {
        aggMap.set(key, {
          site_id: site,
          date: dayStr,
          level: 'ad',
          campaign_id: campaignId || null,
          adset_id: adsetId || null,
          ad_id: adId || null,
          impressions: 0,
          all_clicks: 0,
          link_clicks: 0,
          spend_usd: 0,
          atc_total: 0,
          ic_total: 0,
          purchase_meta: 0,
          batch_id: batchId,
        });
      }
      const ag = aggMap.get(key);
      ag.impressions += payload.impressions;
      ag.all_clicks += payload.clicks;
      ag.link_clicks += payload.clicks;
      ag.spend_usd += payload.spend;
      ag.atc_total += payload.add_to_cart;
      ag.ic_total += payload.initiate_checkout;
      ag.purchase_meta += payload.purchases;
    }

    const dailyRows = Array.from(aggMap.values()).map(r => {
      return {
        ...r,
        ctr_all: r.impressions ? r.all_clicks / r.impressions : null,
        ctr_link: r.impressions ? r.link_clicks / r.impressions : null,
        cpm: r.impressions ? (r.spend_usd / r.impressions) * 1000 : null,
        cpc_all: r.all_clicks ? r.spend_usd / r.all_clicks : null,
        cpc_link: r.link_clicks ? r.spend_usd / r.link_clicks : null,
      };
    });

    const supabase = getClient();

    if (rawRows.length) {
      await supabase.from('fb_raw').insert(rawRows);
    }
    if (campaigns.size) {
      await supabase.from('meta_campaign').upsert(Array.from(campaigns.values()), { onConflict: 'campaign_id' });
    }
    if (adsets.size) {
      await supabase.from('meta_adset').upsert(Array.from(adsets.values()), { onConflict: 'adset_id' });
    }
    if (ads.size) {
      await supabase.from('meta_ad').upsert(Array.from(ads.values()), { onConflict: 'ad_id' });
    }
    if (dailyRows.length) {
      await supabase.from('fact_meta_daily').upsert(dailyRows, { onConflict: 'site_id,date,level,campaign_id,adset_id,ad_id,product_id' });
    }
    await supabase.from('core_ingestion_batch').insert({
      batch_id: batchId,
      site_id: site,
      channel_id: 'meta_ads',
      file_name: uploaded.originalFilename || uploaded.newFilename || uploaded.name,
      row_count: rawRows.length,
    });

    res.status(200).json({ ok: true, rows: rawRows.length, batch_id: batchId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

handler.config = {
  api: { bodyParser: false },
};

module.exports = handler;
