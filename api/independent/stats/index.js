// /api/independent/stats/index.js
const { createClient } = require('@supabase/supabase-js');
function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

function parseDate(s, fallback) {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0,10) : fallback;
}

function extractName(url) {
  try {
    const u = new URL(url);
    return u.pathname.split('/').pop() || u.pathname || url;
  } catch {
    return url;
  }
}

function safeNum(v){
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const PAGE_SIZE = 1000;

function lastWeek() {
  const today = new Date();
  const dow = today.getDay();
  // Monday of this week
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setDate(today.getDate() - ((dow + 6) % 7));
  // Previous week's Monday and Sunday
  const from = new Date(mondayThisWeek);
  from.setDate(mondayThisWeek.getDate() - 7);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return {
    from: from.toISOString().slice(0,10),
    to: to.toISOString().slice(0,10)
  };
}

// 判断站点使用哪个数据源
function getDataSource(site) {
  // icyberite.com 使用 Facebook Ads 数据
  if (site === 'icyberite.com' || site === 'independent_icyberite') {
    return 'facebook_ads';
  }
  // poolsvacuum.com 使用 Google Ads 数据
  if (site === 'poolsvacuum.com' || site === 'independent_poolsvacuum') {
    return 'google_ads';
  }
  // 其他站点默认使用 Google Ads 数据
  return 'google_ads';
}

// 获取站点渠道配置
async function getSiteChannels(supabase, site) {
  try {
    const { data: configs, error } = await supabase
      .from('site_channel_configs')
      .select('channel, table_name, is_enabled')
      .eq('site_id', site)
      .eq('is_enabled', true);
    
    if (error) {
      console.error('查询站点渠道配置失败:', error);
      throw error;
    }
    
    // 如果有配置数据，返回配置
    if (configs && configs.length > 0) {
      console.log('找到站点渠道配置:', configs);
      return configs;
    }
    
    // 如果没有配置数据，根据站点返回默认配置
    const dataSource = getDataSource(site);
    const defaultConfig = [{ 
      channel: dataSource, 
      table_name: dataSource === 'facebook_ads' ? 'independent_facebook_ads_daily' : 'independent_landing_metrics', 
      is_enabled: true 
    }];
    console.log('使用默认渠道配置:', defaultConfig, 'for site:', site);
    return defaultConfig;
  } catch (error) {
    console.error('获取站点渠道配置失败:', error);
    // 回退到原有逻辑
    const dataSource = getDataSource(site);
    const fallbackConfig = [{ 
      channel: dataSource, 
      table_name: dataSource === 'facebook_ads' ? 'independent_facebook_ads_daily' : 'independent_landing_metrics', 
      is_enabled: true 
    }];
    console.log('回退到默认渠道配置:', fallbackConfig, 'for site:', site);
    return fallbackConfig;
  }
}

// 查询 Facebook Ads 数据
async function queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device) {
  const table = [];
  
  // 站点名称映射：将前端使用的站点名映射为数据库中的实际值
  const siteMapping = {
    'icyberite.com': 'independent_icyberite'
  };
  const dbSite = siteMapping[site] || site;
  
  // 调试日志：查询参数
  console.log('Facebook Ads查询参数:', {
    originalSite: site,
    dbSite: dbSite,
    fromDate,
    toDate,
    limitNum,
    campaign,
    network,
    device
  });
  
  // 先检查数据库中是否有该站点的数据
  const { data: siteCheck, error: siteError } = await supabase
    .from('independent_facebook_ads_daily')
    .select('site, day, campaign_name')
    .eq('site', dbSite)
    .limit(5);
  
  if (siteError) {
    console.error('检查站点数据失败:', siteError);
  } else {
    console.log('站点数据检查结果:', {
      siteExists: siteCheck && siteCheck.length > 0,
      sampleData: siteCheck
    });
  }
  
  // 使用用户指定的日期范围，不进行自动回退
  let actualFromDate = fromDate;
  let actualToDate = toDate;
  let useLatestData = false;
  
  console.log('使用用户指定的日期范围:', {
    fromDate,
    toDate,
    dbSite
  });
  
  for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
    const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
    let query = supabase
      .from('independent_facebook_ads_daily')
      .select('*')
      .eq('site', dbSite)
      .gte('day', actualFromDate).lte('day', actualToDate)
      .order('day', { ascending: false });
    
    if (campaign) query = query.eq('campaign_name', campaign);
    // Facebook Ads 没有 network 和 device 字段，跳过这些过滤
    
    const { data, error } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(`Facebook Ads query error: ${error.message}`);
    
    console.log(`Facebook Ads查询结果 (${fromIdx}-${toIdx}):`, {
      dataLength: data.length,
      sampleData: data.slice(0, 2)
    });
    
    table.push(...data);
    if (!data.length || data.length < PAGE_SIZE) break;
  }
  
  // 转换 Facebook Ads 数据格式为统一格式
  const transformedData = table.map(r => ({
    site: site, // 使用原始的site值，而不是数据库中的值
    day: r.day,
    product_id: r.product_id || '', // 商品编号
    product_name: r.product_name || '', // 商品名称
    landing_path: r.landing_url || '',
    landing_url: r.landing_url || '',
    campaign: r.campaign_name,
    network: 'facebook', // Facebook Ads 固定为 facebook
    device: 'all', // Facebook Ads 没有设备区分
    
    // 核心指标字段
    clicks: safeNum(r.clicks),
    impr: safeNum(r.impressions),
    ctr: safeNum(r.ctr_all),
    avg_cpc: safeNum(r.cpc_all),
    cost: safeNum(r.spend_usd),
    conversions: safeNum(r.results), // 使用成效作为转化
    cost_per_conv: r.results > 0 ? safeNum(r.spend_usd / r.results) : 0,
    all_conv: safeNum(r.results),
    conv_value: safeNum(r.conversion_value),
    all_conv_rate: r.impressions > 0 ? safeNum(r.results / r.impressions * 100) : 0,
    conv_rate: r.clicks > 0 ? safeNum(r.results / r.clicks * 100) : 0,
    
    // Facebook Ads 完整字段映射
    campaign_name: r.campaign_name || '',
    adset_name: r.adset_name || '',
    ad_name: r.ad_name || '',
    delivery_status: r.delivery_status || '',
    delivery_level: r.delivery_level || '',
    attribution_setting: r.attribution_setting || '',
    objective: r.objective || '',
    
    // 核心指标
    reach: safeNum(r.reach),
    frequency: safeNum(r.frequency),
    link_clicks: safeNum(r.link_clicks),
    unique_link_clicks: safeNum(r.unique_link_clicks),
    unique_clicks: safeNum(r.unique_clicks),
    link_ctr: safeNum(r.link_ctr),
    unique_ctr_all: safeNum(r.unique_ctr_all),
    cpm: safeNum(r.cpm),
    cpc_link: safeNum(r.cpc_link),
    
    // 转化相关字段
    results: safeNum(r.results),
    cost_per_result: safeNum(r.cost_per_result),
    
    // 购物车相关字段
    atc_total: safeNum(r.atc_total),
    atc_web: safeNum(r.atc_web),
    atc_meta: safeNum(r.atc_meta),
    
    // 心愿单字段
    wishlist_adds: safeNum(r.wishlist_adds),
    
    // 结账相关字段
    ic_total: safeNum(r.ic_total),
    ic_web: safeNum(r.ic_web),
    ic_meta: safeNum(r.ic_meta),
    
    // 购物相关字段
    purchases: safeNum(r.purchases),
    purchases_web: safeNum(r.purchases_web),
    purchases_meta: safeNum(r.purchases_meta),
    
    // 店铺相关字段
    store_clicks: safeNum(r.store_clicks),
    
    // 页面浏览字段
    page_views: safeNum(r.page_views),
    
    // 日期字段
    row_start_date: r.row_start_date,
    row_end_date: r.row_end_date,
    report_start_date: r.report_start_date,
    report_end_date: r.report_end_date,
    
    // 广告素材字段
    ad_link: r.ad_link || '',
    image_name: r.image_name || '',
    video_name: r.video_name || '',
    
    // 原始数据保留
    _raw: r
  }));
  
  // 调试日志：数据转换结果
  console.log('Facebook Ads数据转换结果:', {
    originalDataLength: table.length,
    transformedDataLength: transformedData.length,
    sampleTransformedData: transformedData.slice(0, 2)
  });
  
  return {
    data: transformedData,
    useLatestData: false,
    actualDateRange: { from: actualFromDate, to: actualToDate }
  };
}

// 查询 Google Ads 数据（原有逻辑）
async function queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device) {
  const table = [];
  
  // 对于Google Ads数据，暂时不实现自动日期范围调整，保持原有行为
  // 这样可以确保不影响现有的poolsvacuum数据
  
    for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
      const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
      let query = supabase
        .from('independent_landing_metrics')
        .select('*')
        .eq('site', site)
        .gte('day', fromDate).lte('day', toDate)
        .order('day', { ascending: false });
  
      if (campaign) query = query.eq('campaign', campaign);
      if (network) query = query.eq('network', network);
      if (device) query = query.eq('device', device);
  
    const { data, error } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(`Google Ads query error: ${error.message}`);
    
    table.push(...data);
    if (!data.length || data.length < PAGE_SIZE) break;
  }
  
  // 返回与queryFacebookAdsData相同的结构，但useLatestData始终为false
  return {
    data: table,
    useLatestData: false,
    actualDateRange: { from: fromDate, to: toDate }
  };
}

// 查询 TikTok Ads 数据
async function queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign) {
  const table = [];
  
  // 站点名称映射：将前端使用的站点名映射为数据库中的实际值
  const siteMapping = {
    'icyberite.com': 'independent_icyberite'
  };
  const dbSite = siteMapping[site] || site;
  
  // 调试日志：查询参数
  console.log('TikTok Ads查询参数:', {
    originalSite: site,
    dbSite: dbSite,
    fromDate,
    toDate,
    limitNum,
    campaign
  });
  
  for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
    const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
    let query = supabase
      .from('independent_tiktok_ads_daily')
      .select('*')
      .eq('site', dbSite)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: false });
    
    if (campaign) query = query.eq('campaign_name', campaign);
    
      const { data, error } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(`TikTok Ads query error: ${error.message}`);
    
    table.push(...data);
      if (!data.length || data.length < PAGE_SIZE) break;
    }

  // 转换TikTok Ads数据格式为统一格式
  const transformedData = table.map(r => ({
    site: site, // 使用原始的site值，而不是数据库中的值
    day: r.day,
    landing_path: r.landing_url || '',
    landing_url: r.landing_url || '',
    campaign: r.campaign_name,
    network: 'tiktok',
    device: 'all',
    // 使用安全数值处理，如果字段不存在则默认为0
    clicks: safeNum(r.clicks || 0),
    impr: safeNum(r.impressions || 0),
    ctr: safeNum(r.ctr || 0),
    avg_cpc: safeNum(r.cpc || 0),
    cost: safeNum(r.spend_usd || 0),
    conversions: safeNum(r.conversions || 0),
    cost_per_conv: (r.conversions && r.conversions > 0) ? safeNum((r.spend_usd || 0) / r.conversions) : 0,
    all_conv: safeNum(r.conversions || 0),
    conv_value: safeNum(r.conversion_value || 0),
    all_conv_rate: (r.impressions && r.impressions > 0) ? safeNum((r.conversions || 0) / r.impressions * 100) : 0,
    conv_rate: (r.clicks && r.clicks > 0) ? safeNum((r.conversions || 0) / r.clicks * 100) : 0,
    // TikTok Ads特有字段
    reach: safeNum(r.reach || 0),
    frequency: safeNum(r.frequency || 0),
    cpm: safeNum(r.cpm || 0),
    // 原始数据保留
    _raw: r
  }));
  
  // 调试日志：数据转换结果
  console.log('TikTok Ads数据转换结果:', {
    originalDataLength: table.length,
    transformedDataLength: transformedData.length,
    sampleTransformedData: transformedData.slice(0, 2)
  });
  
  return {
    data: transformedData,
    useLatestData: false,
    actualDateRange: { from: fromDate, to: toDate }
  };
}

module.exports = async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    const { site, from, to, limit = '20000', only_new, campaign, network, device, aggregate, channel } = req.query;
    const def = lastWeek();
    const toDate = parseDate(to, def.to);
    const fromDate = parseDate(from, def.from);
    const onlyNew = String(only_new || '') === '1';
    const isProductAggregate = String(aggregate || '') === 'product';

    console.log('独立站查询参数:', { site, from: fromDate, to: toDate, limit, only_new, campaign, network, device, aggregate, channel });

    if (!site) return res.status(400).json({ error: 'missing site param, e.g. ?site=poolsvacuum.com' });

    // table data (fetch all pages up to limit)
    const limitNum = Math.min(Number(limit) || PAGE_SIZE, 20000);
    let table = [];

    // 用于跟踪是否使用了最新数据
    let useLatestData = false;
    let actualDateRange = { from: fromDate, to: toDate };

    // 如果指定了渠道，直接查询该渠道
    if (channel) {
      console.log('查询指定渠道:', channel, 'for site:', site);
      if (channel === 'facebook_ads') {
        const result = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
        table = result.data;
        useLatestData = result.useLatestData || false;
        actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
      } else if (channel === 'tiktok_ads') {
        const result = await queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign);
        table = result.data;
        useLatestData = result.useLatestData || false;
        actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        } else {
          const result = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
          table = result.data;
          useLatestData = result.useLatestData || false;
          actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        }
    } else {
      // 获取站点所有启用的渠道
      const channels = await getSiteChannels(supabase, site);
      console.log('站点渠道配置:', channels);

      // 查询所有启用的渠道数据
      const allTables = [];
      for (const channelConfig of channels) {
        let channelTable = [];
        if (channelConfig.channel === 'facebook_ads') {
          const result = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
          channelTable = result.data;
          useLatestData = result.useLatestData || false;
          actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        } else if (channelConfig.channel === 'tiktok_ads') {
          const result = await queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign);
          channelTable = result.data;
          useLatestData = result.useLatestData || false;
          actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        } else {
          const result = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
          channelTable = result.data;
          useLatestData = result.useLatestData || false;
          actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        }
        allTables.push(...channelTable);
      }
      table = allTables;
    }

    // 保持向后兼容：如果没有渠道配置或查询结果为空，使用原有逻辑
    if (table.length === 0) {
      const dataSource = getDataSource(site);
      console.log('回退到原有逻辑，数据源:', dataSource, 'for site:', site);
      
      if (dataSource === 'facebook_ads') {
        const result = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
        table = result.data;
        useLatestData = result.useLatestData || false;
        actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        console.log('Facebook Ads查询结果:', table.length, '条记录');
      } else {
        const result = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
        table = result.data;
        useLatestData = result.useLatestData || false;
        actualDateRange = result.actualDateRange || { from: fromDate, to: toDate };
        console.log('Google Ads查询结果:', table.length, '条记录');
      }
    }

    // 统一的商品标识提取函数
    function extractProductId(record, channel) {
      if (channel === 'facebook_ads') {
        // Facebook Ads: 优先使用product_id字段
        if (record.product_id) {
          return record.product_id;
        }
        // 如果没有product_id，从landing_url中提取商品ID
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

    // 为每条记录提取商品标识
    const productIds = table.map(r => extractProductId(r, channel)).filter(Boolean);
    const uniqueProductIds = Array.from(new Set(productIds));
    
    const firstSeenMap = new Map();
    if (uniqueProductIds.length) {
      try {
        // 批量查询，避免URI过长的问题
        const BATCH_SIZE = 100; // 每批查询100个商品ID
        const batches = [];
        for (let i = 0; i < uniqueProductIds.length; i += BATCH_SIZE) {
          batches.push(uniqueProductIds.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`分批查询first_seen，共${uniqueProductIds.length}个商品ID，分${batches.length}批`);
        
        // 直接使用站点名称，不需要映射
        const dbSite = site;
        
        // 并行查询所有批次
        const batchPromises = batches.map(batch => 
          supabase
            .from('independent_first_seen')
            .select('product_identifier, first_seen_date')
            .eq('site', dbSite)
            .in('product_identifier', batch)
        );
        
        const batchResults = await Promise.all(batchPromises);
        
        // 合并所有批次的结果
        batchResults.forEach(({ data: fsRows, error: fsErr }) => {
          if (fsErr) {
            console.error('批次查询失败:', fsErr);
            return;
          }
          (fsRows || []).forEach(r => firstSeenMap.set(r.product_identifier, r.first_seen_date));
        });
        
        // 调试日志
        console.log('firstSeen查询结果:', {
          site,
          totalProductIds: uniqueProductIds.length,
          batches: batches.length,
          fsRowsCount: firstSeenMap.size,
          sampleFirstSeen: Array.from(firstSeenMap.entries()).slice(0, 3)
        });
      } catch (e) {
        console.error('independent_first_seen lookup failed', e.message);
      }
    }

    // total distinct products ever seen for this site
    let productTotal = 0;
    try {
      // 直接使用站点名称，不需要映射
      const dbSite = site;
      
      const { count: totalCount, error: totalErr } = await supabase
        .from('independent_first_seen')
        .select('product_identifier', { count: 'exact', head: true })
        .eq('site', dbSite);
      if (totalErr) throw totalErr;
      productTotal = totalCount || 0;
    } catch (e) {
      console.error('independent_first_seen count failed', e.message);
    }

    // 如果没有指定渠道，使用默认渠道
    if (!channel && table.length > 0) {
      // 从数据中推断渠道
      const networks = [...new Set(table.map(r => r.network))];
      if (networks.includes('facebook')) {
        channel = 'facebook_ads';
      } else if (networks.includes('tiktok')) {
        channel = 'tiktok_ads';
      } else {
        channel = 'google_ads';
      }
      console.log('未指定渠道，使用默认渠道:', channel, '基于网络:', networks);
    }

    // 调试日志：数据映射前的状态
    console.log('数据映射前状态:', {
      originalTableLength: table.length,
      firstSeenMapSize: firstSeenMap.size,
      channel: channel,
      sampleOriginalData: table.slice(0, 2)
    });
    
    table = (table || []).map(r => {
      const productId = extractProductId(r, channel);
      const firstSeen = firstSeenMap.get(productId) || null;
      
      // 调试新品检测逻辑
      let is_new = false;
      if (firstSeen) {
        const firstSeenDate = new Date(firstSeen);
        const fromDateObj = new Date(fromDate);
        const toDateObj = new Date(toDate);
        
        is_new = firstSeenDate >= fromDateObj && firstSeenDate <= toDateObj;
        
        // 添加调试日志（只对前几条记录）
        if (table.length < 3) {
          console.log('新品检测调试:', {
            productId,
            firstSeen,
            firstSeenDate: firstSeenDate.toISOString(),
            fromDate,
            fromDateObj: fromDateObj.toISOString(),
            toDate,
            toDateObj: toDateObj.toISOString(),
            is_new
          });
        }
      }
      
      return {
      ...r,
        product: productId, // 使用统一的商品标识
        product_display_name: extractName(r.landing_path || r.landing_url || r.campaign_name), // 用于显示的名称
      clicks: safeNum(r.clicks),
      impr: safeNum(r.impr),
      ctr: safeNum(r.ctr),
      avg_cpc: safeNum(r.avg_cpc),
      cost: safeNum(r.cost),
      conversions: safeNum(r.conversions),
      cost_per_conv: safeNum(r.cost_per_conv),
      all_conv: safeNum(r.all_conv),
      conv_value: safeNum(r.conv_value),
      all_conv_rate: safeNum(r.all_conv_rate),
      conv_rate: safeNum(r.conv_rate),
        is_new: is_new,
        first_seen_date: firstSeen
      };
    });

    // 调试日志：数据映射后的状态
    console.log('数据映射后状态:', {
      mappedTableLength: table.length,
      sampleMappedData: table.slice(0, 2)
    });

    if (onlyNew) {
      table = table.filter(r => r.is_new);
      console.log('新品筛选后:', { filteredTableLength: table.length });
    }

    // 如果请求产品聚合，按产品聚合数据
    if (isProductAggregate) {
      const productMap = new Map();
      table.forEach(r => {
        // 根据数据源确定商品标识
        let key;
        if (r.product_id) {
          // Facebook Ads数据：优先使用product_id
          key = r.product_id;
        } else if (r.landing_path) {
          // Google Ads数据：使用landing_path
          key = r.landing_path;
        } else if (r.campaign) {
          // 回退到campaign
          key = r.campaign;
        } else if (r.landing_url) {
          // 最后回退到landing_url
          key = r.landing_url;
        } else {
          key = 'unknown';
        }
        
        if (!key || key === 'unknown') return;
        
        // 拆分product_identifier为product_id和product_name
        let productIdOnly = key;
        let productName = '';
        
        if (channel === 'facebook_ads' && key.includes(',')) {
          // Facebook Ads格式: "50073860800824, XREAL One AR Glasses | 3DoF Floating Display..."
          const parts = key.split(',');
          if (parts.length >= 2) {
            productIdOnly = parts[0].trim();
            productName = parts.slice(1).join(',').trim();
          }
        } else {
          // 其他情况，使用原始值
          productIdOnly = key;
          productName = r.product_name || '';
        }
        
        if (!productMap.has(productIdOnly)) {
          productMap.set(productIdOnly, {
            // 与前端Facebook Ads表格列名匹配的字段
            product_id: productIdOnly, // 商品ID
            product_name: productName, // 商品名称
            product: key, // 商品编号（保留原始值用于兼容性）
            days: 0, // 天数
            campaign_name: r.campaign_name || r.campaign, // 广告系列名称
            adset_name: r.adset_name || '', // 广告组名称
            ad_name: r.ad_name || '', // 广告名称
            delivery_status: r.delivery_status || '', // 投放状态
            delivery_level: r.delivery_level || '', // 投放层级
            network: r.network, // 网络
            impr: 0, // 展示次数
            reach: 0, // 覆盖人数
            frequency: 0, // 频次
            clicks: 0, // 点击量（全部）
            link_clicks: 0, // 链接点击量
            unique_link_clicks: 0, // 链接点击量 - 独立用户
            unique_clicks: 0, // 点击量（全部）- 独立用户
            ctr: 0, // 点击率（全部）
            link_ctr: 0, // 链接点击率
            unique_ctr_all: 0, // 点击率（全部）- 独立用户
            page_views: 0, // 浏览量
            atc_total: 0, // 加入购物车
            atc_web: 0, // 网站加入购物车
            atc_meta: 0, // Meta 加入购物车
            wishlist_adds: 0, // 加入心愿单次数
            ic_total: 0, // 结账发起次数
            ic_web: 0, // 网站结账发起次数
            ic_meta: 0, // Meta 结账发起次数
            store_clicks: 0, // 店铺点击量
            purchases: 0, // 购物次数
            purchases_web: 0, // 网站购物
            purchases_meta: 0, // Meta 内购物次数
            cost: 0, // 成效（花费）
            spend_usd: 0, // 已花费金额 (USD)
            cpc_all: 0, // 单次点击费用
            cpc_link: 0, // 单次链接点击费用
            cpm: 0, // 千次展示费用
            results: 0, // 成效
            cost_per_result: 0, // 单次成效费用
            conversion_value: 0, // 转化价值
            // 添加缺失的字段初始化
            conversions: 0, // 转化次数
            all_conv: 0, // 所有转化
            conv_value: 0, // 转化价值
            avg_cpc: 0, // 平均点击成本
            cost_per_conv: 0, // 单次转化成本
            all_conv_rate: 0, // 所有转化率
            conv_rate: 0, // 转化率
            row_start_date: r.row_start_date || '', // 开始日期
            row_end_date: r.row_end_date || '', // 结束日期
            report_start_date: r.report_start_date || '', // 报告开始日期
            report_end_date: r.report_end_date || '', // 报告结束日期
            ad_link: r.ad_link || '', // 链接（广告设置）
            landing_url: r.landing_url || '', // 网址
            image_name: r.image_name || '', // 图片名称
            video_name: r.video_name || '', // 视频名称
            // 保留原有字段用于计算
            landing_path: r.landing_path,
            campaign: r.campaign,
            device: r.device,
            is_new: r.is_new,
            first_seen_date: r.first_seen_date
          });
        }
        
        const existing = productMap.get(productIdOnly);
        // 累加基础指标 - 使用安全的数值处理
        existing.clicks += (r.clicks || 0);
        existing.impr += (r.impr || 0);
        existing.cost += (r.cost || 0);
        existing.conversions += (r.conversions || 0);
        existing.all_conv += (r.all_conv || 0);
        existing.conv_value += (r.conv_value || 0);
        existing.days += 1;
        
        // 累加Facebook Ads完整字段
        existing.reach += r.reach || 0;
        existing.frequency += r.frequency || 0;
        existing.link_clicks += r.link_clicks || 0;
        existing.unique_link_clicks += r.unique_link_clicks || 0;
        existing.unique_clicks += r.unique_clicks || 0;
        existing.page_views += r.page_views || 0;
        existing.atc_total += r.atc_total || 0;
        existing.atc_web += r.atc_web || 0;
        existing.atc_meta += r.atc_meta || 0;
        existing.wishlist_adds += r.wishlist_adds || 0;
        existing.ic_total += r.ic_total || 0;
        existing.ic_web += r.ic_web || 0;
        existing.ic_meta += r.ic_meta || 0;
        existing.store_clicks += r.store_clicks || 0;
        existing.purchases += r.purchases || 0;
        existing.purchases_web += r.purchases_web || 0;
        existing.purchases_meta += r.purchases_meta || 0;
        existing.spend_usd += r.spend_usd || 0;
        existing.results += r.results || 0;
        // 累加文本字段（取第一个非空值）
        if (!existing.attribution_setting && r.attribution_setting) {
          existing.attribution_setting = r.attribution_setting;
        }
        if (!existing.objective && r.objective) {
          existing.objective = r.objective;
        }
      });
      
      // 重新计算比率
      productMap.forEach(p => {
        p.ctr = p.impr > 0 ? (p.clicks / p.impr) : 0; // 点击率（全部）
        p.link_ctr = p.impr > 0 ? (p.link_clicks / p.impr) : 0; // 链接点击率
        p.unique_ctr_all = p.impr > 0 ? (p.unique_clicks / p.impr) : 0; // 点击率（全部）- 独立用户
        p.avg_cpc = p.clicks > 0 ? (p.spend_usd / p.clicks) : 0; // 单次点击费用
        p.cpc_link = p.link_clicks > 0 ? (p.spend_usd / p.link_clicks) : 0; // 单次链接点击费用
        p.cpm = p.impr > 0 ? (p.spend_usd / p.impr * 1000) : 0; // 千次展示费用
        p.cost_per_conv = p.conversions > 0 ? (p.spend_usd / p.conversions) : 0;
        p.cost_per_result = p.results > 0 ? (p.spend_usd / p.results) : 0; // 单次成效费用
        p.all_conv_rate = p.impr > 0 ? (p.all_conv / p.impr * 100) : 0;
        p.conv_rate = p.clicks > 0 ? (p.all_conv / p.clicks * 100) : 0;
        // 计算平均频次
        p.frequency = p.days > 0 ? (p.frequency / p.days) : 0;
      });
      
      table = Array.from(productMap.values());
      console.log('产品聚合后:', { aggregatedTableLength: table.length });
    }

    // 计算KPI
    const total_clicks = table.reduce((sum, r) => sum + r.clicks, 0);
    const total_impressions = table.reduce((sum, r) => sum + r.impr, 0);
    const total_cost = table.reduce((sum, r) => sum + r.cost, 0);
    const total_conversions = table.reduce((sum, r) => sum + r.conversions, 0);
    const total_all_conv = table.reduce((sum, r) => sum + r.all_conv, 0);
    const total_conv_value = table.reduce((sum, r) => sum + r.conv_value, 0);
    
    const kpis = {
      total_clicks: total_clicks,
      total_impressions: total_impressions,
      total_cost: total_cost,
      total_conversions: total_conversions,
      total_all_conv: total_all_conv,
      total_conv_value: total_conv_value,
      // 修复平均点击率计算：总点击数/总曝光数 * 100
      avg_ctr: total_impressions > 0 ? (total_clicks / total_impressions * 100) : 0,
      // 修复平均转化率计算：总转化数/总点击数 * 100
      avg_conv_rate: total_clicks > 0 ? (total_conversions / total_clicks * 100) : 0,
      new_products: table.filter(r => r.is_new).length,
      total_products: productTotal,
      // 商品计数KPI
      exposure_product_count: table.filter(r => r.impr > 0).length,
      click_product_count: table.filter(r => r.clicks > 0).length,
      conversion_product_count: table.filter(r => r.conversions > 0).length,
      new_product_count: table.filter(r => r.is_new).length
    };

    // 获取可用渠道列表
    let availableChannels = [];
    if (channel) {
      // 如果指定了渠道，只返回该渠道
      availableChannels = [channel];
    } else {
      // 获取站点所有启用的渠道
      try {
        const channels = await getSiteChannels(supabase, site);
        availableChannels = channels.map(c => c.channel);
      } catch (error) {
        console.error('获取可用渠道失败:', error);
        // 回退到原有逻辑
        const dataSource = getDataSource(site);
        availableChannels = [dataSource];
      }
    }

    // 总是返回渠道信息，让前端能够正确识别渠道类型
    let finalCurrentChannel = channel;
    if (!finalCurrentChannel) {
      // 如果没有指定渠道，根据站点确定默认渠道
      const dataSource = getDataSource(site);
      finalCurrentChannel = dataSource;
      console.log('未指定渠道，使用站点默认渠道:', finalCurrentChannel, 'for site:', site);
    }
    
    const response = {
      ok: true,
      table: table,
      kpis: kpis,
      dataSource: finalCurrentChannel || (table.length > 0 ? 'multi_channel' : getDataSource(site)),
      query: { site, from: fromDate, to: toDate, limit, only_new, campaign, network, device, aggregate, channel },
      availableChannels: availableChannels,
      currentChannel: finalCurrentChannel || null,
      isMultiChannel: availableChannels.length > 1
    };
    
    // 移除useLatestData消息，因为不再使用回退逻辑

    // 调试日志：最终返回的数据
    console.log('API最终返回数据:', {
      tableLength: table.length,
      kpisKeys: Object.keys(kpis),
      availableChannels,
      currentChannel: finalCurrentChannel || null,
      sampleTableData: table.slice(0, 2)
    });

    return res.json(response);

  } catch (error) {
    console.error('独立站查询错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
