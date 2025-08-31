// /api/dynamic-ingest/[siteId].js
// 通用动态数据上传API，支持不同站点的数据源
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteId } = req.query;
  if (!siteId) {
    return res.status(400).json({ error: 'Site ID is required' });
  }

  const supabase = getClient();

  try {
    // 获取站点配置
    const { data: siteConfig, error: siteError } = await supabase
      .from('site_configs')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !siteConfig) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // 获取数据源模板
    let template = null;
    if (siteConfig.template_id) {
      const { data: templateData } = await supabase
        .from('data_source_templates')
        .select('*')
        .eq('id', siteConfig.template_id)
        .single();
      template = templateData;
    }

    // 解析上传的文件
    const form = formidable();
    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 根据数据源类型处理文件
    let processedData;
    switch (siteConfig.data_source) {
      case 'facebook_ads':
        processedData = await processFacebookAdsFile(file.filepath, template);
        break;
      case 'google_ads':
        processedData = await processGoogleAdsFile(file.filepath, template);
        break;
      default:
        processedData = await processGenericFile(file.filepath, template);
    }

    if (!processedData.length) {
      return res.status(400).json({ error: 'No valid data found in file' });
    }

    // 添加站点标识
    const dataWithSite = processedData.map(row => ({
      ...row,
      site: siteConfig.name
    }));

    // 确定目标表名
    const tableName = `${siteId}_${siteConfig.data_source}_daily`;

    // 上传数据到对应的表
    const { data, error: insertError } = await supabase
      .from(tableName)
      .upsert(dataWithSite, { 
        onConflict: 'site,campaign_name,row_start_date' // 根据实际主键调整
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to insert data: ' + insertError.message });
    }

    // 清理临时文件
    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      ok: true,
      processed: processedData.length,
      upserted: data?.length || 0,
      table: tableName
    });

  } catch (error) {
    console.error('Dynamic ingest error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// 处理Facebook Ads文件
async function processFacebookAdsFile(filePath, template) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 查找标题行
  let headerRow = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.some(cell => String(cell).includes('广告系列名称'))) {
      headerRow = i;
      break;
    }
  }

  const headers = rows[headerRow];
  const dataRows = rows.slice(headerRow + 1);

  const mappings = template?.fields_json?.mappings || {
    '广告系列名称': 'campaign_name',
    '广告组名称': 'adset_name',
    '投放层级': 'level',
    '商品编号': 'product_identifier',
    '覆盖人数': 'reach',
    '展示次数': 'impressions',
    '频次': 'frequency',
    '链接点击量': 'link_clicks',
    '点击量（全部）': 'all_clicks',
    '点击率（全部）': 'all_ctr',
    '链接点击率': 'link_ctr',
    '单次链接点击费用': 'cpc_link',
    '已花费金额 (USD)': 'spend_usd',
    '加入购物车': 'atc_total',
    '网站加入购物车': 'atc_web',
    'Meta 加入购物车': 'atc_meta',
    '结账发起次数': 'ic_total',
    '网站结账发起次数': 'ic_web',
    'Meta 结账发起次数': 'ic_meta',
    '网站购物': 'purchase_web',
    'Meta 内购物次数': 'purchase_meta',
    '开始日期': 'row_start_date',
    '结束日期': 'row_end_date',
    '网址': 'landing_url',
    '图片名称': 'creative_name'
  };

  const processedData = [];
  
  for (const row of dataRows) {
    if (!row[0] || row[0] === 'Total') continue;

    const record = {};
    
    // 映射字段
    for (const [chineseName, englishName] of Object.entries(mappings)) {
      const headerIndex = headers.findIndex(h => String(h).includes(chineseName));
      if (headerIndex !== -1) {
        let value = row[headerIndex];
        
        // 数据类型转换
        if (englishName.includes('date')) {
          value = parseDate(value);
        } else if (englishName.includes('ctr') || englishName.includes('rate')) {
          value = parsePercentage(value);
        } else if (englishName.includes('spend') || englishName.includes('cpc') || englishName.includes('cpm')) {
          value = parseNumber(value);
        } else if (englishName.includes('reach') || englishName.includes('impressions') || englishName.includes('clicks') || englishName.includes('purchase') || englishName.includes('atc') || englishName.includes('ic')) {
          value = parseInteger(value);
        }
        
        record[englishName] = value;
      }
    }

    // 计算派生字段
    if (record.spend_usd && record.impressions) {
      record.cpm = (record.spend_usd / record.impressions) * 1000;
    }
    if (record.spend_usd && record.all_clicks) {
      record.cpc_all = record.spend_usd / record.all_clicks;
    }
    if (record.spend_usd && record.purchase_web) {
      record.cpa_purchase_web = record.spend_usd / record.purchase_web;
    }

    if (Object.keys(record).length > 0) {
      processedData.push(record);
    }
  }

  return processedData;
}

// 处理Google Ads文件
async function processGoogleAdsFile(filePath, template) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 查找标题行
  let headerRow = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.some(cell => String(cell).includes('Landing page'))) {
      headerRow = i;
      break;
    }
  }

  const headers = rows[headerRow];
  const dataRows = rows.slice(headerRow + 1);

  const mappings = template?.fields_json?.mappings || {
    'Landing page': 'landing_url',
    'Campaign': 'campaign',
    'Day': 'day',
    'Network (with search partners)': 'network',
    'Device': 'device',
    'Clicks': 'clicks',
    'Impr.': 'impr',
    'CTR': 'ctr',
    'Avg. CPC': 'avg_cpc',
    'Cost': 'cost',
    'Conversions': 'conversions',
    'Cost / conv.': 'cost_per_conv'
  };

  const processedData = [];
  
  for (const row of dataRows) {
    if (!row[0] || row[0] === 'Total') continue;

    const record = {};
    
    // 映射字段
    for (const [englishName, fieldName] of Object.entries(mappings)) {
      const headerIndex = headers.findIndex(h => String(h).includes(englishName));
      if (headerIndex !== -1) {
        let value = row[headerIndex];
        
        // 数据类型转换
        if (fieldName === 'day') {
          value = parseDate(value);
        } else if (fieldName === 'ctr') {
          value = parsePercentage(value);
        } else if (fieldName === 'avg_cpc' || fieldName === 'cost' || fieldName === 'cost_per_conv') {
          value = parseNumber(value);
        } else if (fieldName === 'clicks' || fieldName === 'impr' || fieldName === 'conversions') {
          value = parseInteger(value);
        }
        
        record[fieldName] = value;
      }
    }

    if (Object.keys(record).length > 0) {
      processedData.push(record);
    }
  }

  return processedData;
}

// 处理通用文件
async function processGenericFile(filePath, template) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const processedData = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    const record = {
      date: parseDate(row[0]),
      data: row
    };

    processedData.push(record);
  }

  return processedData;
}

// 辅助函数
function parseDate(value) {
  if (!value) return null;
  
  if (typeof value === 'number') {
    // Excel日期格式
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d).toISOString().split('T')[0];
    }
  }
  
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

function parseNumber(value) {
  if (!value) return 0;
  const num = Number(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

function parseInteger(value) {
  return Math.round(parseNumber(value));
}

function parsePercentage(value) {
  if (!value) return 0;
  const str = String(value).replace('%', '');
  const num = parseNumber(str);
  return num / 100;
}
