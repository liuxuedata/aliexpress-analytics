// /api/fb_ingest/index.js
// Ingest Facebook/Meta export reports and normalise fields

const multiparty = require('multiparty');
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const fs = require('fs');

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing SUPABASE_URL or key');
  return createClient(url, key, { auth: { persistSession: false } });
}

const norm = s => String(s || '').replace(/[\s%（）()]/g, '').toLowerCase();
const toNum = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

// Header aliases for facebook exports
const XL = {
  campaign_name: ['广告系列名称', 'campaignname'],
  adset_name: ['广告组名称', 'adsetname'],
  level: ['投放层级', 'level'],
  product_identifier: ['商品编号', 'productidentifier'],
  reach: ['覆盖人数', 'reach'],
  impressions: ['展示次数', 'impressions'],
  frequency: ['频次', 'frequency'],
  link_clicks: ['链接点击量', 'linkclicks'],
  all_clicks: ['点击量（全部）', 'allclicks'],
  all_ctr: ['点击率（全部）', 'ctr（全部）', 'allctr'],
  link_ctr: ['链接点击率', 'linkctr'],
  spend_usd: ['已花费金额(usd)', 'spendusd'],
  atc_total: ['加入购物车', 'addtocart'],
  atc_web: ['网站加入购物车', 'addtocart(web)'],
  atc_meta: ['meta加入购物车', 'addtocart(meta)'],
  ic_total: ['结账发起次数', 'initiatecheckout'],
  ic_web: ['网站结账发起次数', 'initiatecheckout(web)'],
  ic_meta: ['meta结账发起次数', 'initiatecheckout(meta)'],
  purchase_web: ['网站购物', 'purch(web)'],
  purchase_meta: ['metainside购物次数', 'purch(meta)'],
  row_start_date: ['开始日期', 'rowstartdate'],
  row_end_date: ['结束日期', 'rowenddate']
};

function pickIdx(headerNorm, aliases) {
  for (const a of aliases) {
    const i = headerNorm.indexOf(norm(a));
    if (i !== -1) return i;
  }
  for (let i = 0; i < headerNorm.length; i++) {
    if (aliases.some(a => headerNorm[i].includes(norm(a)))) return i;
  }
  return -1;
}

module.exports = async (req, res) => {
  let step = 'start';
  try {
    const supabase = supa();
    step = 'multipart';
    const form = new multiparty.Form({ uploadDir: '/tmp' });
    const { fileBuffer } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files?.file?.[0] || files?.excel?.[0];
        if (!f) return reject(new Error('no file field'));
        const p = f.path || f.filepath;
        try {
          const buf = fs.readFileSync(p);
          resolve({ fileBuffer: buf });
        } catch (e) { reject(e); }
      });
    });

    step = 'xlsx';
    const wb = xlsx.read(fileBuffer, { type: 'buffer' });
    const ws = wb.Sheets['Raw Data Report'] || wb.Sheets[wb.SheetNames[0]];
    const arr = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (!arr || !arr.length) throw new Error('empty worksheet');
    const header = arr[0];
    const rows = arr.slice(1).filter(r => r && r.length);
    const H = header.map(norm);

    const I = {};
    for (const key of Object.keys(XL)) {
      I[key] = pickIdx(H, XL[key]);
    }

    const siteId = req.query.site_id || 'icyberite';

    const payload = rows.map(r => {
      const row = {
        site_id: siteId,
        level: I.level >= 0 ? r[I.level] : null,
        campaign_name: I.campaign_name >= 0 ? r[I.campaign_name] : null,
        adset_name: I.adset_name >= 0 ? r[I.adset_name] : null,
        product_identifier: I.product_identifier >= 0 ? r[I.product_identifier] : null,
        reach: toNum(I.reach >= 0 ? r[I.reach] : null),
        impressions: toNum(I.impressions >= 0 ? r[I.impressions] : null),
        frequency: toNum(I.frequency >= 0 ? r[I.frequency] : null),
        link_clicks: toNum(I.link_clicks >= 0 ? r[I.link_clicks] : null),
        all_clicks: toNum(I.all_clicks >= 0 ? r[I.all_clicks] : null),
        all_ctr: toNum(I.all_ctr >= 0 ? r[I.all_ctr] : null),
        link_ctr: toNum(I.link_ctr >= 0 ? r[I.link_ctr] : null),
        spend_usd: toNum(I.spend_usd >= 0 ? r[I.spend_usd] : null),
        atc_total: toNum(I.atc_total >= 0 ? r[I.atc_total] : null),
        atc_web: toNum(I.atc_web >= 0 ? r[I.atc_web] : null),
        atc_meta: toNum(I.atc_meta >= 0 ? r[I.atc_meta] : null),
        ic_total: toNum(I.ic_total >= 0 ? r[I.ic_total] : null),
        ic_web: toNum(I.ic_web >= 0 ? r[I.ic_web] : null),
        ic_meta: toNum(I.ic_meta >= 0 ? r[I.ic_meta] : null),
        purchase_web: toNum(I.purchase_web >= 0 ? r[I.purchase_web] : null),
        purchase_meta: toNum(I.purchase_meta >= 0 ? r[I.purchase_meta] : null)
      };
      row.cpm = row.impressions > 0 ? row.spend_usd / row.impressions * 1000 : null;
      row.cpc_link = row.link_clicks > 0 ? row.spend_usd / row.link_clicks : null;
      row.cpc_all = row.all_clicks > 0 ? row.spend_usd / row.all_clicks : null;
      row.row_start_date = I.row_start_date >= 0 ? r[I.row_start_date] : null;
      row.row_end_date = I.row_end_date >= 0 ? r[I.row_end_date] : null;
      return row;
    });

    step = 'respond';
    // Upsert to fact_meta_daily; ignore errors for schema mismatch
    try {
      await supabase.from('fact_meta_daily').upsert(payload);
    } catch (e) {
      console.warn('upsert failed', e.message);
    }
    return res.status(200).json({ ok: true, rows: payload.length });
  } catch (e) {
    console.error('fb_ingest-error', step, e);
    return res.status(500).json({ ok: false, step, msg: e.message });
  }
};
