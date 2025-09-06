// /api/universal-ingest/facebook-ads.js
// 统一的Facebook Ads数据摄入API，支持所有独立站点
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable').default;
const fs = require('fs');
const XLSX = require('xlsx');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

// 日期解析函数
function parseDay(dayRaw) {
  console.log('parseDay 输入:', { dayRaw, type: typeof dayRaw });
  
  if (!dayRaw) return null;
  
  // 如果是Date对象
  if (dayRaw instanceof Date) {
    const result = { date: dayRaw, isValid: !isNaN(dayRaw.getTime()) };
    console.log('parseDay Date对象解析结果:', result);
    return result.isValid ? dayRaw.toISOString().split('T')[0] : null;
  }
  
  // 如果是数字（Excel序列日期）
  if (typeof dayRaw === 'number') {
    const excelDate = new Date((dayRaw - 25569) * 86400 * 1000);
    const result = { date: excelDate, isValid: !isNaN(excelDate.getTime()) };
    console.log('parseDay Excel序列日期解析结果:', result);
    return result.isValid ? excelDate.toISOString().split('T')[0] : null;
  }
  
  // 如果是字符串
  if (typeof dayRaw === 'string') {
    const str = dayRaw.trim();
    console.log('parseDay 处理字符串:', str);
    
    // 尝试多种日期格式
    const formats = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
      /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
      /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
    ];
    
    for (const format of formats) {
      if (format.test(str)) {
        const date = new Date(str);
        const result = { date, isValid: !isNaN(date.getTime()) };
        console.log('parseDay 格式匹配解析结果:', result);
        if (result.isValid) {
          return date.toISOString().split('T')[0];
        }
      }
    }
    
    // 通用日期解析
    const date = new Date(str);
    const result = { date, isValid: !isNaN(date.getTime()) };
    console.log('parseDay 通用日期解析结果:', result);
    return result.isValid ? date.toISOString().split('T')[0] : null;
  }
  
  console.log('parseDay 无法解析的类型:', typeof dayRaw);
  return null;
}

// 数值转换函数
function coerceNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

// 列名标准化函数（支持中文）
function canon(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

// 查找列索引
function col(headers, ...names) {
  for (const name of names) {
    const idx = headers.findIndex(h => canon(h) === canon(name));
    if (idx !== -1) return idx;
  }
  return -1;
}

// 处理上传文件
async function handleFile(filePath, filename, siteId) {
  const ext = (filename || '').toLowerCase();
  let workbook;
  
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    workbook = XLSX.readFile(filePath);
  } else if (ext.endsWith('.csv')) {
    const csvData = fs.readFileSync(filePath, 'utf8');
    workbook = XLSX.read(csvData, { type: 'string' });
  } else {
    throw new Error('不支持的文件格式，请上传 .xlsx, .xls 或 .csv 文件');
  }
  
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  console.log('开始查找表头行，总行数:', rawData.length);
  console.log('前3行数据:', rawData.slice(0, 3));
  
  // 查找表头行
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim();
      console.log('检查单元格:', cell);
      
      // 查找包含"单日"或"日期"的列
      if (canon(cell).includes('单日') || canon(cell).includes('日期') || canon(cell).includes('day')) {
        console.log('找到中文列:', cell);
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex !== -1) break;
  }
  
  if (headerRowIndex === -1) {
    throw new Error('未找到表头行，请确保文件包含日期列');
  }
  
  console.log('找到表头行:', headerRowIndex);
  const headers = rawData[headerRowIndex];
  console.log('表头内容:', headers);
  
  // 详细显示表头信息
  console.log('表头详细信息:');
  headers.forEach((header, index) => {
    console.log(`列${index}: "${header}"`);
  });
  
  const dataRows = rawData.slice(headerRowIndex + 1);
  console.log('数据行数量:', dataRows.length);
  console.log('前3行数据:');
  dataRows.slice(0, 3).forEach((row, index) => {
    console.log(`第${index + 1}行:`, row);
  });
  
  // 查找列索引
  const dateCol = col(headers, '单日', '日期', 'Day', 'Date');
  const campaignCol = col(headers, '广告系列名称', 'Campaign Name', 'Campaign');
  const adsetCol = col(headers, '广告组名称', 'Adset Name', 'Adset');
  const impressionsCol = col(headers, '展示次数', 'Impressions');
  const clicksCol = col(headers, '点击量（全部）', 'All Clicks', 'Clicks');
  const spendCol = col(headers, '已花费金额 (USD)', 'Spend (USD)', 'Spend');
  const cpmCol = col(headers, 'CPM', '千次展示成本');
  const cpcCol = col(headers, '单次点击成本', 'CPC');
  const ctrCol = col(headers, '点击率（全部）', 'CTR');
  const reachCol = col(headers, '覆盖人数', 'Reach');
  const frequencyCol = col(headers, '频次', 'Frequency');
  const landingUrlCol = col(headers, '网址', 'Landing URL', 'URL');
  const conversionsCol = col(headers, '加入购物车', 'Add to Cart', 'Conversions');
  const purchasesCol = col(headers, '网站购物', 'Purchases', 'Purchase');
  const conversionValueCol = col(headers, '转化价值', 'Conversion Value', 'Value');
  
  console.log('列索引信息:', {
    dateCol, campaignCol, adsetCol, impressionsCol, clicksCol, spendCol,
    cpmCol, cpcCol, ctrCol, reachCol, frequencyCol, landingUrlCol,
    conversionsCol, purchasesCol, conversionValueCol
  });
  
  // 验证必需列
  if (dateCol === -1) {
    throw new Error('未找到日期列，请确保文件包含"单日"或"日期"列');
  }
  if (campaignCol === -1) {
    throw new Error('未找到广告系列列，请确保文件包含"广告系列名称"列');
  }
  
  const processed = [];
  console.log('开始处理数据行，总行数:', dataRows.length);
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    console.log(`处理第${i+1}行数据:`, row);
    
    const dayRaw = row[dateCol];
    const dayStr = parseDay(dayRaw);
    console.log(`第${i+1}行日期解析结果:`, { raw: dayRaw, parsed: dayStr });
    
    if (!dayStr) {
      console.log(`第${i+1}行被跳过：日期解析失败`);
      continue;
    }
    
    const campaign = String(row[campaignCol] || '').trim();
    const adset = adsetCol !== -1 ? String(row[adsetCol] || '').trim() : campaign; // 使用campaign作为默认adset
    const landingUrl = landingUrlCol !== -1 ? String(row[landingUrlCol] || '').trim() : '';
    
    if (!campaign) {
      console.log(`第${i+1}行被跳过：广告系列名称为空`);
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
      all_clicks: coerceNum(row[clicksCol]),
      link_clicks: coerceNum(row[clicksCol]),
      link_ctr: coerceNum(row[ctrCol]),
      ic_web: 0,
      ic_meta: 0,
      ic_total: coerceNum(row[clicksCol]),
      atc_web: conversionsCol !== -1 ? coerceNum(row[conversionsCol]) : 0,
      atc_meta: 0,
      atc_total: conversionsCol !== -1 ? coerceNum(row[conversionsCol]) : 0,
      purchase_web: purchasesCol !== -1 ? coerceNum(row[purchasesCol]) : 0,
      purchase_meta: 0,
      cpa_purchase_web: 0,
      conversion_value: conversionValueCol !== -1 ? coerceNum(row[conversionValueCol]) : 0,
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
    const siteId = req.headers['x-site-id'];
    console.log('接收到的站点ID:', siteId);
    
    if (!siteId) {
      return res.status(400).json({ error: 'Site ID is required' });
    }

    // 验证站点是否存在
    const { data: siteConfig, error: siteError } = await supabase
      .from('site_configs')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !siteConfig) {
      return res.status(404).json({ error: 'Site not found' });
    }

    if (siteConfig.data_source !== 'facebook_ads') {
      return res.status(400).json({ error: 'Site is not configured for Facebook Ads' });
    }

    // 配置formidable
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
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
          console.log('Formidable解析成功:', { fields, files });
          resolve([fields, files]);
        }
      });
    });

    // 处理formidable v3的文件结构
    let file = files.file;
    if (Array.isArray(file)) {
      file = file[0];
    }
    
    if (!file) {
      console.error('没有找到上传的文件:', files);
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = file.filepath || file.path;
    
    console.log('处理文件:', {
      originalFilename: file.originalFilename || file.name,
      filepath: filePath,
      size: file.size,
      mimetype: file.mimetype || file.type
    });

    if (!filePath || !fs.existsSync(filePath)) {
      console.error('文件路径无效或文件不存在:', filePath);
      return res.status(400).json({ error: 'File path is invalid or file does not exist' });
    }

    const records = await handleFile(filePath, file.originalFilename || file.name, siteId);
    
    if (records.length === 0) {
      return res.status(400).json({ error: 'No valid records found in file' });
    }

    console.log(`处理了 ${records.length} 条记录`);

    // 使用统一的Facebook Ads表
    const tableName = 'independent_facebook_ads_daily';
    console.log('目标表名:', tableName);
    console.log('站点ID:', siteId);

    // 插入数据到统一表
    const { data: upsertedData, error: upsertError } = await supabase
      .from(tableName)
      .upsert(records, { 
        onConflict: 'site,day,campaign_name,adset_name',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      console.error('数据插入错误:', upsertError);
      throw upsertError;
    }

    console.log(`成功插入 ${upsertedData.length} 条记录到表 ${tableName}`);

    // 清理临时文件
    try {
      fs.unlinkSync(filePath);
      console.log('临时文件已清理:', filePath);
    } catch (cleanupError) {
      console.warn('清理临时文件失败:', cleanupError);
    }

    return res.json({
      ok: true,
      processed: records.length,
      upserted: upsertedData.length,
      table: tableName,
      site: siteId
    });

  } catch (error) {
    console.error('Universal Facebook Ads ingest error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.toString()
    });
  }
}
