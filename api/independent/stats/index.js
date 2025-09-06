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
  // 其他站点使用 Google Ads 数据
  return 'google_ads';
}

// 获取站点渠道配置
async function getSiteChannels(supabase, site) {
  try {
    const { data: configs } = await supabase
      .from('site_channel_configs')
      .select('channel, table_name, is_enabled')
      .eq('site_id', site)
      .eq('is_enabled', true);
    
    return configs || [{ channel: 'google_ads', table_name: 'independent_landing_metrics', is_enabled: true }];
  } catch (error) {
    console.error('获取站点渠道配置失败:', error);
    // 回退到原有逻辑
    return [{ channel: getDataSource(site), table_name: getDataSource(site) === 'facebook_ads' ? 'independent_facebook_ads_daily' : 'independent_landing_metrics', is_enabled: true }];
  }
}

// 查询 Facebook Ads 数据
async function queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device) {
  const table = [];
  
  for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
    const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
    let query = supabase
      .from('independent_facebook_ads_daily')
      .select('*')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: false });
    
    if (campaign) query = query.eq('campaign_name', campaign);
    // Facebook Ads 没有 network 和 device 字段，跳过这些过滤
    
    const { data, error } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(`Facebook Ads query error: ${error.message}`);
    
    table.push(...data);
    if (!data.length || data.length < PAGE_SIZE) break;
  }
  
  // 转换 Facebook Ads 数据格式为统一格式
  return table.map(r => ({
    site: r.site,
    day: r.day,
    landing_path: r.landing_url || '',
    landing_url: r.landing_url || '',
    campaign: r.campaign_name,
    network: 'facebook', // Facebook Ads 固定为 facebook
    device: 'all', // Facebook Ads 没有设备区分
    clicks: safeNum(r.clicks),
    impr: safeNum(r.impressions),
    ctr: safeNum(r.all_ctr),
    avg_cpc: safeNum(r.cpc_all),
    cost: safeNum(r.spend_usd),
    conversions: safeNum(r.atc_total), // 使用加购作为转化
    cost_per_conv: r.atc_total > 0 ? safeNum(r.spend_usd / r.atc_total) : 0,
    all_conv: safeNum(r.atc_total),
    conv_value: safeNum(r.conversion_value),
    all_conv_rate: r.impressions > 0 ? safeNum(r.atc_total / r.impressions * 100) : 0,
    conv_rate: r.clicks > 0 ? safeNum(r.atc_total / r.clicks * 100) : 0,
    // Facebook Ads 特有字段
    reach: safeNum(r.reach),
    frequency: safeNum(r.frequency),
    link_clicks: safeNum(r.link_clicks),
    link_ctr: safeNum(r.link_ctr),
    cpm: safeNum(r.cpm),
    // 原始数据保留
    _raw: r
  }));
}

// 查询 Google Ads 数据（原有逻辑）
async function queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device) {
  const table = [];
  
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
  
  return table;
}

// 查询 TikTok Ads 数据
async function queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign) {
  const table = [];
  
  for (let fromIdx = 0; table.length < limitNum; fromIdx += PAGE_SIZE) {
    const toIdx = Math.min(fromIdx + PAGE_SIZE - 1, limitNum - 1);
    let query = supabase
      .from('independent_tiktok_ads_daily')
      .select('*')
      .eq('site', site)
      .gte('day', fromDate).lte('day', toDate)
      .order('day', { ascending: false });
    
    if (campaign) query = query.eq('campaign_name', campaign);
    
    const { data, error } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(`TikTok Ads query error: ${error.message}`);
    
    table.push(...data);
    if (!data.length || data.length < PAGE_SIZE) break;
  }
  
  // 转换TikTok Ads数据格式为统一格式
  return table.map(r => ({
    site: r.site,
    day: r.day,
    landing_path: r.landing_url || '',
    landing_url: r.landing_url || '',
    campaign: r.campaign_name,
    network: 'tiktok',
    device: 'all',
    clicks: safeNum(r.clicks),
    impr: safeNum(r.impressions),
    ctr: safeNum(r.ctr),
    avg_cpc: safeNum(r.cpc),
    cost: safeNum(r.spend_usd),
    conversions: safeNum(r.conversions),
    cost_per_conv: r.conversions > 0 ? safeNum(r.spend_usd / r.conversions) : 0,
    all_conv: safeNum(r.conversions),
    conv_value: safeNum(r.conversion_value),
    all_conv_rate: r.impressions > 0 ? safeNum(r.conversions / r.impressions * 100) : 0,
    conv_rate: r.clicks > 0 ? safeNum(r.conversions / r.clicks * 100) : 0,
    // TikTok Ads特有字段
    reach: safeNum(r.reach),
    frequency: safeNum(r.frequency),
    cpm: safeNum(r.cpm),
    // 原始数据保留
    _raw: r
  }));
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

    // 如果指定了渠道，直接查询该渠道
    if (channel) {
      console.log('查询指定渠道:', channel, 'for site:', site);
      if (channel === 'facebook_ads') {
        table = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
      } else if (channel === 'tiktok_ads') {
        table = await queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign);
      } else {
        table = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
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
          channelTable = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
        } else if (channelConfig.channel === 'tiktok_ads') {
          channelTable = await queryTikTokAdsData(supabase, site, fromDate, toDate, limitNum, campaign);
        } else {
          channelTable = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
        }
        allTables.push(...channelTable);
      }
      table = allTables;
    }

    // 保持向后兼容：如果没有渠道配置，使用原有逻辑
    if (table.length === 0) {
      const dataSource = getDataSource(site);
      console.log('回退到原有逻辑，数据源:', dataSource, 'for site:', site);
      
      if (dataSource === 'facebook_ads') {
        table = await queryFacebookAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
      } else {
        table = await queryGoogleAdsData(supabase, site, fromDate, toDate, limitNum, campaign, network, device);
      }
    }

    // 统一的商品标识提取函数
    function extractProductId(record, channel) {
      if (channel === 'facebook_ads') {
        // Facebook Ads: 从landing_url中提取商品ID，或使用campaign_name作为商品标识
        // 如果landing_url包含数字ID，提取它；否则使用campaign_name
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
        
        // 并行查询所有批次
        const batchPromises = batches.map(batch => 
          supabase
            .from('independent_first_seen')
            .select('product_identifier, first_seen_date')
            .eq('site', site)
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
      const { count: totalCount, error: totalErr } = await supabase
        .from('independent_first_seen')
        .select('product_identifier', { count: 'exact', head: true })
        .eq('site', site);
      if (totalErr) throw totalErr;
      productTotal = totalCount || 0;
    } catch (e) {
      console.error('independent_first_seen count failed', e.message);
    }

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

    if (onlyNew) {
      table = table.filter(r => r.is_new);
    }

    // 如果请求产品聚合，按产品聚合数据
    if (isProductAggregate) {
      const productMap = new Map();
      table.forEach(r => {
        const key = r.product; // 使用统一的商品标识
        if (!key) return;
        
        if (!productMap.has(key)) {
          productMap.set(key, {
            product: r.product,
            landing_path: r.landing_path,
            landing_url: r.landing_url,
            campaign: r.campaign,
            network: r.network,
            device: r.device,
            clicks: 0,
            impr: 0,
            ctr: 0,
            avg_cpc: 0,
            cost: 0,
            conversions: 0,
            cost_per_conv: 0,
            all_conv: 0,
            conv_value: 0,
            all_conv_rate: 0,
            conv_rate: 0,
            is_new: r.is_new,
            first_seen_date: r.first_seen_date,
            days: 0
          });
        }
        
        const existing = productMap.get(key);
        existing.clicks += r.clicks;
        existing.impr += r.impr;
        existing.cost += r.cost;
        existing.conversions += r.conversions;
        existing.all_conv += r.all_conv;
        existing.conv_value += r.conv_value;
        existing.days += 1;
      });
      
      // 重新计算比率
      productMap.forEach(p => {
        p.ctr = p.impr > 0 ? (p.clicks / p.impr * 100) : 0;
        p.avg_cpc = p.clicks > 0 ? (p.cost / p.clicks) : 0;
        p.cost_per_conv = p.conversions > 0 ? (p.cost / p.conversions) : 0;
        p.all_conv_rate = p.impr > 0 ? (p.all_conv / p.impr * 100) : 0;
        p.conv_rate = p.clicks > 0 ? (p.all_conv / p.clicks * 100) : 0;
      });
      
      table = Array.from(productMap.values());
    }

    // 计算KPI
    const kpis = {
      total_clicks: table.reduce((sum, r) => sum + r.clicks, 0),
      total_impressions: table.reduce((sum, r) => sum + r.impr, 0),
      total_cost: table.reduce((sum, r) => sum + r.cost, 0),
      total_conversions: table.reduce((sum, r) => sum + r.conversions, 0),
      total_all_conv: table.reduce((sum, r) => sum + r.all_conv, 0),
      total_conv_value: table.reduce((sum, r) => sum + r.conv_value, 0),
      avg_ctr: table.length > 0 ? table.reduce((sum, r) => sum + r.ctr, 0) / table.length : 0,
      avg_conv_rate: table.length > 0 ? table.reduce((sum, r) => sum + r.conv_rate, 0) / table.length : 0,
      new_products: table.filter(r => r.is_new).length,
      total_products: productTotal,
      // 商品计数KPI
      exposure_product_count: table.filter(r => r.impr > 0).length,
      click_product_count: table.filter(r => r.clicks > 0).length,
      conversion_product_count: table.filter(r => r.conversions > 0).length,
      new_product_count: table.filter(r => r.is_new).length
    };

    return res.json({
      ok: true,
      table: table,
      kpis: kpis,
      dataSource: channel || (table.length > 0 ? 'multi_channel' : getDataSource(site)),
      query: { site, from: fromDate, to: toDate, limit, only_new, campaign, network, device, aggregate, channel }
    });

  } catch (error) {
    console.error('独立站查询错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
