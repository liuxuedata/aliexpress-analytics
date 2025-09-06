// /api/independent/tiktok-ingest/index.js
// TikTok Ads数据上传API
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable').default;
const fs = require('fs');
const XLSX = require('xlsx');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function coerceNum(x) {
  if (x === null || x === undefined || x === '' || x === '--') return 0;
  let s = String(x).trim();
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// TikTok Ads日期解析
function parseDay(dayRaw) {
  console.log('parseDay 输入:', { dayRaw, type: typeof dayRaw });
  
  if (dayRaw === null || dayRaw === undefined || dayRaw === '') {
    return null;
  }

  if (typeof dayRaw === 'number') {
    const s = String(dayRaw);
    if (/^\d{8}$/.test(s)) {
      return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    }
    const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    return null;
  }

  const s = String(dayRaw).trim();
  
  // 支持多种日期格式
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  }
  
  const d = new Date(s);
  return !isNaN(d.getTime()) ? d : null;
}

async function handleFile(filePath, filename, siteId) {
  const ext = (filename || '').toLowerCase();
  let rows = [];

  if (ext.endsWith('.csv')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const wb = XLSX.read(raw, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  } else {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  }

  // 查找TikTok Ads表头
  let headerIdx = rows.findIndex(r => (r||[]).some(c => {
    const cell = String(c||'').trim().toLowerCase();
    return cell.includes('campaign') || cell.includes('adgroup') || cell.includes('date') ||
           cell.includes('impression') || cell.includes('click') || cell.includes('spend') ||
           cell.includes('conversion') || cell.includes('reach') || cell.includes('frequency') ||
           // 中文关键词
           cell.includes('广告') || cell.includes('系列') || cell.includes('组') || cell.includes('日') ||
           cell.includes('展示') || cell.includes('点击') || cell.includes('花费') || cell.includes('转化');
  }));
  
  if (headerIdx === -1) {
    throw new Error('Header row not found. Make sure the sheet has TikTok Ads columns.');
  }
  
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  // 标准化列名
  const canon = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // TikTok Ads列映射
  const campaignCol = col('campaign name', 'campaign', 'campaign_name', '广告系列名称');
  const adgroupCol = col('adgroup name', 'adgroup', 'adgroup_name', 'ad group', '广告组名称');
  const dateCol = col('date', 'day', 'start date', '单日', '开始日期');
  const impressionsCol = col('impressions', 'imp', 'impression', '展示次数');
  const clicksCol = col('clicks', 'click', '点击量');
  const spendCol = col('spend', 'cost', 'amount spent', '花费', '已花费金额');
  const cpmCol = col('cpm', 'cost per 1000 impressions');
  const cpcCol = col('cpc', 'cost per click', '单次点击费用');
  const ctrCol = col('ctr', 'click through rate', '点击率');
  const reachCol = col('reach', '覆盖人数');
  const frequencyCol = col('frequency', '频次');
  const conversionsCol = col('conversions', 'conversion', '转化', '转化次数');
  const conversionValueCol = col('conversion value', 'conversion_value', '转化价值');
  const landingUrlCol = col('landing page', 'landing_url', 'url', '网址');

  if (campaignCol === -1 || dateCol === -1) {
    throw new Error(`Required columns not found. Need at least "Campaign name" and "Date". Found columns: ${header.join(', ')}`);
  }

  const processed = [];
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    
    if (!row || row.length < Math.max(campaignCol, dateCol)) {
      continue;
    }

    const day = parseDay(row[dateCol]);
    if (!day) {
      continue;
    }

    const dayStr = day.toISOString().slice(0, 10);
    const campaign = String(row[campaignCol] || '').trim();
    const adgroup = adgroupCol !== -1 ? String(row[adgroupCol] || '').trim() : campaign;

    if (!campaign || !dayStr) {
      continue;
    }

    const record = {
      site: siteId,
      day: dayStr,
      campaign_name: campaign,
      adgroup_name: adgroup,
      landing_url: landingUrlCol !== -1 ? String(row[landingUrlCol] || '').trim() : '',
      impressions: coerceNum(row[impressionsCol]),
      clicks: coerceNum(row[clicksCol]),
      spend_usd: coerceNum(row[spendCol]),
      cpm: coerceNum(row[cpmCol]),
      cpc: coerceNum(row[cpcCol]),
      ctr: coerceNum(row[ctrCol]),
      reach: coerceNum(row[reachCol]),
      frequency: coerceNum(row[frequencyCol]),
      conversions: coerceNum(row[conversionsCol]),
      conversion_value: coerceNum(row[conversionValueCol]),
      row_start_date: dayStr,
      row_end_date: dayStr,
      inserted_at: new Date().toISOString()
    };

    processed.push(record);
  }

  // 去重
  const uniqueRecords = [];
  const seenKeys = new Set();
  
  for (const record of processed) {
    const key = `${record.site}|${record.day}|${record.campaign_name}|${record.adgroup_name}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRecords.push(record);
    }
  }
  
  return uniqueRecords;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Site-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    
    const currentIndepSiteId = req.headers['x-site-id'];
    console.log('接收到的站点ID:', currentIndepSiteId);
    
    if (!currentIndepSiteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // 配置formidable
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024,
      keepExtensions: true,
      uploadDir: process.env.TEMP || '/tmp',
      filename: (name, ext, part, form) => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}-${random}${ext}`;
      }
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Formidable解析错误:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    let file = files.file;
    if (Array.isArray(file)) {
      file = file[0];
    }
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = file.filepath || file.path;
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'File path is invalid or file does not exist' });
    }

    const records = await handleFile(filePath, file.originalFilename || file.name, currentIndepSiteId);
    
    if (records.length === 0) {
      return res.status(400).json({ error: 'No valid records found in file' });
    }

    console.log(`处理了 ${records.length} 条记录`);

    // 插入到TikTok Ads表
    const tableName = 'independent_tiktok_ads_daily';
    
    const { data, error } = await supabase
      .from(tableName)
      .upsert(records, {
        onConflict: 'site,day,campaign_name,adgroup_name'
      });

    if (error) {
      console.error('数据插入失败:', error);
      return res.status(500).json({ 
        error: error.message,
        details: error.details
      });
    }

    // 清理临时文件
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('清理临时文件失败:', e.message);
    }

    return res.status(200).json({
      ok: true,
      inserted: records.length,
      message: `Successfully processed ${records.length} TikTok Ads records`
    });

  } catch (error) {
    console.error('TikTok Ads数据上传错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
