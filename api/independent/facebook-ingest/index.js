// /api/independent/facebook-ingest/index.js
// Upload Facebook Ads export (xlsx or csv) and upsert into Supabase
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_ANON_KEY (insert allowed by RLS)
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

function parseUrlParts(u) {
  try {
    const url = new URL(u);
    return { site: url.hostname.replace(/^www\./, ''), path: url.pathname || '/' };
  } catch(e) {
    return { site: 'unknown', path: u || '/' };
  }
}

function coerceNum(x) {
  if (x === null || x === undefined || x === '' || x === '--') return 0;
  let s = String(x).trim();
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Normalize assorted date representations to a Date in UTC.
function parseDay(dayRaw) {
  if (dayRaw === null || dayRaw === undefined || dayRaw === '') return null;

  if (typeof dayRaw === 'number') {
    const s = String(dayRaw);
    // Handle numbers shaped like 20250818 (YYYYMMDD)
    if (/^\d{8}$/.test(s)) {
      return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    }
    // Otherwise assume an Excel serial date
    const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
    return null;
  }

  const s = String(dayRaw).trim();
  // Support "YYYY/M/D" or "YYYY-M-D"
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  // Plain 8-digit string
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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

  // Find header row (contains Facebook Ads specific columns)
  let headerIdx = rows.findIndex(r => (r||[]).some(c => {
    const cell = String(c||'').trim().toLowerCase();
    // 支持标准Facebook Ads格式
    if (cell === 'campaign name' || cell === 'adset name' || cell === 'date' || 
        cell === 'campaign_name' || cell === 'adset_name' || 
        cell === 'campaign' || cell === 'adset' ||
        cell.includes('campaign') || cell.includes('adset') || cell.includes('date')) {
      return true;
    }
    // 支持icyberite特定格式
    if (cell === 'campaign' || cell === 'ad set' || cell === 'adset' || 
        cell === 'date' || cell === 'day' || cell === 'start date' ||
        cell === 'impressions' || cell === 'clicks' || cell === 'spend' ||
        cell === 'cost' || cell === 'ctr' || cell === 'cpc' || cell === 'cpm') {
      return true;
    }
    return false;
  }));
  
  if (headerIdx === -1) {
    console.log('尝试查找Facebook Ads列，前5行数据:', rows.slice(0, 5));
    // 尝试更宽松的匹配
    headerIdx = rows.findIndex(r => (r||[]).some(c => {
      const cell = String(c||'').trim().toLowerCase();
      return cell.includes('campaign') || cell.includes('ad') || cell.includes('date') ||
             cell.includes('impression') || cell.includes('click') || cell.includes('cost') ||
             cell.includes('conversion') || cell.includes('spend') || cell.includes('reach') ||
             cell.includes('frequency') || cell.includes('cpm') || cell.includes('ctr') ||
             cell.includes('cpc') || cell.includes('value');
    }));
  }
  
  if (headerIdx === -1) {
    console.error('未找到Facebook Ads列，请确保文件包含以下列之一：Campaign name, Adset name, Date');
    console.log('文件前10行数据:', rows.slice(0, 10));
    throw new Error('Header row not found. Make sure the sheet has Facebook Ads columns like "Campaign name", "Adset name", "Date".');
  }
  
  console.log('找到表头行:', headerIdx, '表头内容:', rows[headerIdx]);
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  // Build a case-insensitive header lookup tolerant of punctuation and spacing
  const canon = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Facebook Ads specific column mappings - 支持多种格式
  const campaignCol = col('campaign name', 'campaign', 'campaign_name');
  const adsetCol = col('adset name', 'adset', 'ad set', 'adset_name', 'ad_set_name');
  const dateCol = col('date', 'day', 'start date', 'startdate');
  const impressionsCol = col('impressions', 'imp', 'impression');
  const clicksCol = col('clicks', 'link clicks', 'click', 'all clicks');
  const spendCol = col('spend', 'amount spent', 'cost', 'amountspent');
  const cpmCol = col('cpm', 'cost per 1,000 impressions', 'costper1000impressions');
  const cpcCol = col('cpc', 'cost per link click', 'costperlinkclick');
  const ctrCol = col('ctr', 'link click-through rate', 'clickthroughrate', 'click through rate');
  const reachCol = col('reach');
  const frequencyCol = col('frequency');
  const landingUrlCol = col('landing page', 'website url', 'url', 'landingpage', 'websiteurl');

  if (campaignCol === -1 || dateCol === -1) {
    throw new Error('Required columns not found. Need at least "Campaign name" and "Date".');
  }

  const processed = [];
  for (const row of dataRows) {
    if (!row || row.length < Math.max(campaignCol, dateCol)) continue;

    const day = parseDay(row[dateCol]);
    if (!day) continue;

    const dayStr = day.toISOString().slice(0, 10);
    const campaign = String(row[campaignCol] || '').trim();
    const adset = adsetCol !== -1 ? String(row[adsetCol] || '').trim() : '';
    const landingUrl = landingUrlCol !== -1 ? String(row[landingUrlCol] || '').trim() : '';

    if (!campaign || !dayStr) continue;

    const record = {
      site: siteId,
      day: dayStr,
      campaign_name: campaign, // 修复字段名
      adset_name: adset,
      landing_url: landingUrl,
      impressions: coerceNum(row[impressionsCol]),
      clicks: coerceNum(row[clicksCol]),
      spend_usd: coerceNum(row[spendCol]),
      cpm: coerceNum(row[cpmCol]),
      cpc_all: coerceNum(row[cpcCol]),
      all_ctr: coerceNum(row[ctrCol]),
      reach: coerceNum(row[reachCol]),
      frequency: coerceNum(row[frequencyCol]),
      // Facebook Ads specific fields
      all_clicks: coerceNum(row[clicksCol]),
      link_clicks: coerceNum(row[clicksCol]),
      ic_web: 0, // 需要根据实际数据调整
      ic_meta: 0, // 需要根据实际数据调整
      ic_total: coerceNum(row[clicksCol]),
      atc_web: 0, // 需要根据实际数据调整
      atc_meta: 0, // 需要根据实际数据调整
      atc_total: 0, // 需要根据实际数据调整
      purchase_web: 0, // 需要根据实际数据调整
      purchase_meta: 0, // 需要根据实际数据调整
      cpa_purchase_web: 0, // 需要根据实际数据调整
      link_ctr: coerceNum(row[ctrCol]),
      row_start_date: dayStr,
      row_end_date: dayStr,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    processed.push(record);
  }

  return processed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Site-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    
    // 从请求头获取站点ID
    const currentIndepSiteId = req.headers['x-site-id'];
    console.log('接收到的站点ID:', currentIndepSiteId);
    
    if (!currentIndepSiteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // 配置formidable
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
      uploadDir: process.env.TEMP || '/tmp', // 使用环境变量或默认临时目录
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
          console.log('Formidable解析成功:', { fields, files });
          resolve([fields, files]);
        }
      });
    });

    // 处理formidable v3的文件结构
    let file = files.file;
    if (Array.isArray(file)) {
      file = file[0]; // 取第一个文件
    }
    
    if (!file) {
      console.error('没有找到上传的文件:', files);
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // formidable v3可能使用filepath而不是filepath
    const filePath = file.filepath || file.path;
    
    console.log('处理文件:', {
      originalFilename: file.originalFilename || file.name,
      filepath: filePath,
      size: file.size,
      mimetype: file.mimetype || file.type
    });

    // 检查文件路径是否存在
    if (!filePath) {
      console.error('文件路径未定义:', file);
      return res.status(400).json({ error: 'File path is undefined' });
    }

    // 检查文件是否实际存在
    if (!fs.existsSync(filePath)) {
      console.error('文件不存在于路径:', filePath);
      return res.status(400).json({ error: 'File does not exist at specified path' });
    }

    const records = await handleFile(filePath, file.originalFilename || file.name, currentIndepSiteId);
    
    if (records.length === 0) {
      return res.status(400).json({ error: 'No valid records found in file' });
    }

    console.log(`处理了 ${records.length} 条记录`);

    // 确定表名 - 修复表名生成逻辑
    const siteName = currentIndepSiteId.replace('independent_', '');
    const tableName = `independent_${siteName}_facebook_ads_daily`;
    
    console.log('目标表名:', tableName);
    console.log('站点ID:', currentIndepSiteId);
    console.log('站点名称:', siteName);
    
    // 检查表是否存在，如果不存在则创建
    try {
      const { error: tableCheckError } = await supabase
        .from(tableName)
        .select('day')
        .limit(1);
      
      if (tableCheckError) {
        console.log('表不存在，尝试创建:', tableName);
        // 调用动态表创建函数
        const { error: createError } = await supabase.rpc('generate_dynamic_table', {
          p_site_id: currentIndepSiteId,
          p_table_name: tableName,
          p_data_source: 'facebook_ads'
        });
        
        if (createError) {
          console.error('创建表失败:', createError);
          return res.status(500).json({ error: `Failed to create table: ${createError.message}` });
        }
      }
    } catch (e) {
      console.log('表检查失败，可能表不存在:', e.message);
    }

    // 插入数据
    const { data, error } = await supabase
      .from(tableName)
      .upsert(records, {
        onConflict: 'site,day,campaign_name,adset_name'
      });

    if (error) {
      console.error('数据插入失败:', error);
      return res.status(500).json({ error: error.message });
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
      message: `Successfully processed ${records.length} records`
    });

  } catch (error) {
    console.error('Facebook Ads数据上传错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
