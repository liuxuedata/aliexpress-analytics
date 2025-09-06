// /api/independent/facebook-ingest/index.js
// 简化版本 - 直接插入数据，不检查表结构
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable').default;
const fs = require('fs');
const XLSX = require('xlsx');

// 统一的商品标识提取函数
function extractProductId(record, channel) {
  if (channel === 'facebook_ads') {
    // Facebook Ads: 从landing_url中提取商品ID，或使用campaign_name作为商品标识
    const landingUrl = record.landing_url || '';
    const productIdMatch = landingUrl.match(/(\d{10,})/); // 匹配10位以上的数字
    if (productIdMatch) {
      return productIdMatch[1];
    }
    // 如果campaign_name包含商品ID格式，使用它
    const campaignName = record.campaign_name || '';
    const campaignIdMatch = campaignName.match(/(\d{10,})/);
    if (campaignIdMatch) {
      return campaignIdMatch[1];
    }
    // 否则使用campaign_name作为标识
    return campaignName;
  } else if (channel === 'tiktok_ads') {
    // TikTok Ads: 类似Facebook的处理
    const landingUrl = record.landing_url || '';
    const productIdMatch = landingUrl.match(/(\d{10,})/);
    if (productIdMatch) {
      return productIdMatch[1];
    }
    return record.campaign_name || record.adgroup_name || '';
  } else {
    // Google Ads: 使用landing_path
    return record.landing_path || '';
  }
}

// 更新first_seen表的函数
async function updateFirstSeen(supabase, site, records, channel) {
  try {
    const firstSeenUpdates = [];
    
    for (const record of records) {
      const productId = extractProductId(record, channel);
      if (!productId) continue;
      
      // 检查是否已存在
      const { data: existing, error: checkError } = await supabase
        .from('independent_first_seen')
        .select('first_seen_date')
        .eq('site', site)
        .eq('landing_path', productId)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('检查first_seen记录失败:', checkError);
        continue;
      }
      
      // 如果不存在，添加新记录
      if (!existing) {
        firstSeenUpdates.push({
          site: site,
          landing_path: productId,
          first_seen_date: record.day
        });
      }
    }
    
    // 批量插入新记录
    if (firstSeenUpdates.length > 0) {
      const { error: insertError } = await supabase
        .from('independent_first_seen')
        .upsert(firstSeenUpdates, { 
          onConflict: 'site,landing_path',
          ignoreDuplicates: true 
        });
      
      if (insertError) {
        console.error('插入first_seen记录失败:', insertError);
      } else {
        console.log(`成功更新 ${firstSeenUpdates.length} 条first_seen记录`);
      }
    }
  } catch (error) {
    console.error('更新first_seen表失败:', error);
  }
}

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
  console.log('parseDay 输入:', { dayRaw, type: typeof dayRaw });
  
  if (dayRaw === null || dayRaw === undefined || dayRaw === '') {
    console.log('parseDay 返回 null: 输入为空');
    return null;
  }

  if (typeof dayRaw === 'number') {
    const s = String(dayRaw);
    console.log('parseDay 处理数字:', s);
    // Handle numbers shaped like 20250818 (YYYYMMDD)
    if (/^\d{8}$/.test(s)) {
      const result = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
      console.log('parseDay 8位数字解析结果:', result);
      return result;
    }
    // Otherwise assume an Excel serial date
    const parsed = XLSX.SSF && XLSX.SSF.parse_date_code(dayRaw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const result = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      console.log('parseDay Excel日期解析结果:', result);
      return result;
    }
    console.log('parseDay 数字解析失败');
    return null;
  }

  const s = String(dayRaw).trim();
  console.log('parseDay 处理字符串:', s);
  
  // Support "YYYY/M/D" or "YYYY-M-D"
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const result = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    console.log('parseDay 日期格式解析结果:', result);
    return result;
  }
  
  // Plain 8-digit string
  if (/^\d{8}$/.test(s)) {
    const result = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    console.log('parseDay 8位字符串解析结果:', result);
    return result;
  }
  
  // 支持更多日期格式
  // 支持 "YYYY年MM月DD日" 格式
  let chineseMatch = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (chineseMatch) {
    const result = new Date(Date.UTC(+chineseMatch[1], +chineseMatch[2] - 1, +chineseMatch[3]));
    console.log('parseDay 中文日期格式解析结果:', result);
    return result;
  }
  
  // 支持 "MM/DD/YYYY" 格式
  let usMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const result = new Date(Date.UTC(+usMatch[3], +usMatch[1] - 1, +usMatch[2]));
    console.log('parseDay 美式日期格式解析结果:', result);
    return result;
  }
  
  // 支持 "DD/MM/YYYY" 格式
  let euMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (euMatch) {
    const result = new Date(Date.UTC(+euMatch[3], +euMatch[2] - 1, +euMatch[1]));
    console.log('parseDay 欧式日期格式解析结果:', result);
    return result;
  }
  
  const d = new Date(s);
  const isValid = !isNaN(d.getTime());
  console.log('parseDay 通用日期解析结果:', { 
    input: s, 
    date: d, 
    isValid, 
    timestamp: d.getTime(),
    isoString: isValid ? d.toISOString() : 'Invalid'
  });
  return isValid ? d : null;
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
  console.log('开始查找表头行，总行数:', rows.length);
  console.log('前3行数据:', rows.slice(0, 3));
  
  let headerIdx = rows.findIndex(r => (r||[]).some(c => {
    const cell = String(c||'').trim();
    const cellLower = cell.toLowerCase();
    console.log('检查单元格:', cell);
    // 支持标准Facebook Ads格式
    if (cellLower === 'campaign name' || cellLower === 'adset name' || cellLower === 'date' || 
        cellLower === 'campaign_name' || cellLower === 'adset_name' || 
        cellLower === 'campaign' || cellLower === 'adset' ||
        cellLower.includes('campaign') || cellLower.includes('adset') || cellLower.includes('date')) {
      console.log('找到标准Facebook Ads列:', cell);
      return true;
    }
    // 支持icyberite特定格式 - 根据图三的字段名
    if (cellLower === 'campaign' || cellLower === 'ad set' || cellLower === 'adset' || 
        cellLower === 'date' || cellLower === 'day' || cellLower === 'start date' ||
        cellLower === 'impressions' || cellLower === 'clicks' || cellLower === 'spend' ||
        cellLower === 'cost' || cellLower === 'ctr' || cellLower === 'cpc' || cellLower === 'cpm' ||
        // icyberite特有字段
        cellLower === 'reach' || cellLower === 'frequency' || cellLower === 'landing page' ||
        cellLower === 'website url' || cellLower === 'url' || cellLower === 'conversions' ||
        cellLower === 'conversion value' || cellLower === 'purchases' || cellLower === 'add to cart') {
      console.log('找到icyberite列:', cell);
      return true;
    }
    // 支持中文列名
    if (cell === '广告系列名称' || cell === '广告组名称' || cell === '单日' || 
        cell === '开始日期' || cell === '展示次数' || cell === '链接点击量' ||
        cell === '已花费金额 (USD)' || cell === '点击率（全部）' || cell === '覆盖人数' ||
        cell === '频次' || cell === '加入购物车' || cell === '网站购物' ||
        cell === '购物次数' || cell === '链接（广告设置）' || cell === '网址') {
      console.log('找到中文列:', cell);
      return true;
    }
    return false;
  }));
  
  if (headerIdx === -1) {
    console.log('尝试查找Facebook Ads列，前5行数据:', rows.slice(0, 5));
    // 尝试更宽松的匹配
    headerIdx = rows.findIndex(r => (r||[]).some(c => {
      const cell = String(c||'').trim();
      const cellLower = cell.toLowerCase();
      return cellLower.includes('campaign') || cellLower.includes('ad') || cellLower.includes('date') ||
             cellLower.includes('impression') || cellLower.includes('click') || cellLower.includes('cost') ||
             cellLower.includes('conversion') || cellLower.includes('spend') || cellLower.includes('reach') ||
             cellLower.includes('frequency') || cellLower.includes('cpm') || cellLower.includes('ctr') ||
             cellLower.includes('cpc') || cellLower.includes('value') || cellLower.includes('purchase') ||
             cellLower.includes('landing') || cellLower.includes('website') || cellLower.includes('url') ||
             // 中文关键词匹配
             cell.includes('广告') || cell.includes('系列') || cell.includes('组') || cell.includes('日') ||
             cell.includes('展示') || cell.includes('点击') || cell.includes('花费') || cell.includes('购物') ||
             cell.includes('覆盖') || cell.includes('频次') || cell.includes('链接') || cell.includes('网址');
    }));
  }
  
  if (headerIdx === -1) {
    console.error('未找到Facebook Ads列，请确保文件包含以下列之一：Campaign name, Adset name, Date 或 广告系列名称, 广告组名称, 单日');
    console.log('文件前10行数据:', rows.slice(0, 10));
    throw new Error('Header row not found. Make sure the sheet has Facebook Ads columns like "Campaign name", "Adset name", "Date" or "广告系列名称", "广告组名称", "单日".');
  }
  
  console.log('找到表头行:', headerIdx, '表头内容:', rows[headerIdx]);
  const header = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);
  
  console.log('表头详细信息:');
  header.forEach((col, index) => {
    console.log(`  列${index}: "${col}"`);
  });
  
  console.log('数据行数量:', dataRows.length);
  if (dataRows.length > 0) {
    console.log('前3行数据:');
    dataRows.slice(0, 3).forEach((row, index) => {
      console.log(`  第${index + 1}行:`, row);
    });
  }

  // Build a case-insensitive header lookup tolerant of punctuation and spacing
  const canon = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ''); // 修复：保留中文字符
  const headerCanon = header.map(canon);
  const col = (...names) => {
    for (const n of names) {
      const idx = headerCanon.indexOf(canon(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  // 调试：输出标准化后的列名
  console.log('标准化后的列名:', headerCanon);

  // Facebook Ads specific column mappings - 支持多种格式，包括中文
  const campaignCol = col('campaign name', 'campaign', 'campaign_name', '广告系列名称');
  const adsetCol = col('adset name', 'adset', 'ad set', 'adset_name', 'ad_set_name', '广告组名称');
  const dateCol = col('date', 'day', 'start date', 'startdate', '单日', '开始日期', '报告开始日期', 'reporting starts', 'reporting starts date', 'date start', 'date_start', 'report date', 'report_date', '时间', '日期', 'date/time', 'datetime');
  const impressionsCol = col('impressions', 'imp', 'impression', '展示次数');
  const clicksCol = col('clicks', 'link clicks', 'click', 'all clicks', '链接点击量', '点击量（全部）');
  const spendCol = col('spend', 'amount spent', 'cost', 'amountspent', '已花费金额 (USD)');
  const cpmCol = col('cpm', 'cost per 1,000 impressions', 'costper1000impressions');
  const cpcCol = col('cpc', 'cost per link click', 'costperlinkclick', '单次链接点击费用');
  const ctrCol = col('ctr', 'link click-through rate', 'clickthroughrate', 'click through rate', '点击率（全部）', '链接点击率');
  const reachCol = col('reach', '覆盖人数');
  const frequencyCol = col('frequency', '频次');
  const landingUrlCol = col('landing page', 'website url', 'url', 'landingpage', 'websiteurl', '链接（广告设置）', '网址');
  // icyberite特有字段
  const conversionsCol = col('conversions', 'conversion', 'conversion_value', '加入购物车', '网站加入购物车', 'Meta 加入购物车');
  const conversionValueCol = col('conversion value', 'conversionvalue', 'value', 'conversion_value', 'conversion_value_usd');
  const purchasesCol = col('purchases', 'purchase', 'purchase_value', '网站购物', 'Meta 内购物次数', '购物次数');
  const addToCartCol = col('add to cart', 'addtocart', 'add to cart conversions', '加入购物车', '网站加入购物车');

  if (campaignCol === -1 || dateCol === -1) {
    console.error('必需列未找到:');
    console.error('  Campaign列索引:', campaignCol);
    console.error('  Date列索引:', dateCol);
    console.error('  可用列名:', header);
    console.error('  标准化列名:', headerCanon);
    throw new Error(`Required columns not found. Need at least "Campaign name" (广告系列名称) and "Date" (单日/开始日期). Found columns: ${header.join(', ')}`);
  }

  const processed = [];
  console.log('开始处理数据行，总行数:', dataRows.length);
  console.log('列索引信息:', {
    campaignCol, dateCol, adsetCol, impressionsCol, clicksCol, spendCol
  });
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    console.log(`处理第${i+1}行数据:`, row);
    
    if (!row || row.length < Math.max(campaignCol, dateCol)) {
      console.log(`第${i+1}行被跳过：行数据无效或列数不足`);
      continue;
    }

    const day = parseDay(row[dateCol]);
    console.log(`第${i+1}行日期解析结果:`, { raw: row[dateCol], parsed: day });
    if (!day) {
      console.log(`第${i+1}行被跳过：日期解析失败`);
      continue;
    }

    const dayStr = day.toISOString().slice(0, 10);
    
    // 详细调试campaign字段提取
    console.log(`第${i+1}行campaign字段调试:`, {
      campaignCol,
      rowLength: row.length,
      rawCampaignValue: row[campaignCol],
      rawCampaignType: typeof row[campaignCol],
      campaignValue: String(row[campaignCol] || '').trim()
    });
    
    const campaign = String(row[campaignCol] || '').trim();
    const adset = adsetCol !== -1 ? String(row[adsetCol] || '').trim() : campaign; // 修复：使用campaign作为默认adset
    const landingUrl = landingUrlCol !== -1 ? String(row[landingUrlCol] || '').trim() : '';

    console.log(`第${i+1}行提取的关键字段:`, { campaign, dayStr, adset, landingUrl });

    if (!campaign || !dayStr) {
      console.log(`第${i+1}行被跳过：campaign或dayStr为空`, { campaign, dayStr });
      continue;
    }

    const record = {
      site: siteId,
      day: dayStr,
      campaign_name: campaign,
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
      atc_web: conversionsCol !== -1 ? coerceNum(row[conversionsCol]) : 0, // 使用conversions字段
      atc_meta: 0, // 需要根据实际数据调整
      atc_total: conversionsCol !== -1 ? coerceNum(row[conversionsCol]) : 0, // 使用conversions字段
      purchase_web: purchasesCol !== -1 ? coerceNum(row[purchasesCol]) : 0, // 使用purchases字段
      purchase_meta: 0, // 需要根据实际数据调整
      cpa_purchase_web: 0, // 需要根据实际数据调整
      link_ctr: coerceNum(row[ctrCol]),
      conversion_value: conversionValueCol !== -1 ? coerceNum(row[conversionValueCol]) : 0, // 新增转化价值字段
      row_start_date: dayStr,
      row_end_date: dayStr,
      inserted_at: new Date().toISOString()
    };

    processed.push(record);
    console.log(`第${i+1}行处理成功，添加到结果中`);
  }

  console.log('数据处理完成，有效记录数:', processed.length);
  console.log('前3条有效记录:', processed.slice(0, 3));
  
  // 去重：基于主键 (site, day, campaign_name, adset_name)
  const uniqueRecords = [];
  const seenKeys = new Set();
  
  for (const record of processed) {
    const key = `${record.site}|${record.day}|${record.campaign_name}|${record.adset_name}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRecords.push(record);
    } else {
      console.log('发现重复记录，跳过:', key);
    }
  }
  
  console.log('去重后记录数:', uniqueRecords.length);
  return uniqueRecords;
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

    // 使用统一的Facebook Ads表
    const tableName = 'independent_facebook_ads_daily';
    
    console.log('目标表名:', tableName);
    console.log('站点ID:', currentIndepSiteId);
    console.log('使用统一表架构');
    console.log('准备插入记录数:', records.length);
    console.log('第一条记录示例:', records[0]);

    // 直接插入数据，不检查表结构
    const { data, error } = await supabase
      .from(tableName)
      .upsert(records, {
        onConflict: 'site,day,campaign_name,adset_name'
      });

    if (error) {
      console.error('数据插入失败:', error);
      console.error('错误详情:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(500).json({ 
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }

    // 更新first_seen表
    await updateFirstSeen(supabase, currentIndepSiteId, records, 'facebook_ads');

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
