import { createClient } from '@supabase/supabase-js';

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getClient();
    const { method } = req;

    switch (method) {
      case 'GET':
        return await getAds(req, res, supabase);
      case 'POST':
        return await createAdCampaign(req, res, supabase);
      case 'PUT':
        return await updateAdCampaign(req, res, supabase);
      case 'DELETE':
        return await deleteAdCampaign(req, res, supabase);
      default:
        return res.status(405).json({ 
          success: false, 
          message: 'Method not allowed' 
        });
    }
  } catch (error) {
    console.error('Ads API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

async function getAds(req, res, supabase) {
  const { 
    site_id, 
    platform,
    status,
    date_from, 
    date_to,
    page = 1, 
    limit = 50,
    order_by = 'created_at',
    order_direction = 'desc'
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  let query = supabase
    .from('ad_campaigns')
    .select(`
      *,
      ad_metrics_daily (
        id,
        date,
        impressions,
        clicks,
        spend,
        conversions,
        conversion_value,
        ctr,
        cpc,
        cpm,
        roas
      )
    `)
    .order(order_by, { ascending: order_direction === 'asc' });
    
  // 应用筛选条件
  if (site_id) query = query.eq('site_id', site_id);
  if (platform) query = query.eq('platform', platform);
  if (status) query = query.eq('status', status);
  if (date_from) query = query.gte('start_date', date_from);
  if (date_to) query = query.lte('end_date', date_to);
  
  // 分页
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Get ads error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch ads',
      error: error.message 
    });
  }
  
  // 计算每个广告活动的汇总指标
  const adsWithMetrics = (data || []).map(ad => {
    const metrics = ad.ad_metrics_daily || [];
    const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
    const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
    const totalSpend = metrics.reduce((sum, m) => sum + (m.spend || 0), 0);
    const totalConversions = metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);
    const totalConversionValue = metrics.reduce((sum, m) => sum + (m.conversion_value || 0), 0);
    
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const roas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
    
    return {
      ...ad,
      summary_metrics: {
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_spend: totalSpend,
        total_conversions: totalConversions,
        total_conversion_value: totalConversionValue,
        avg_ctr: avgCtr,
        avg_cpc: avgCpc,
        avg_cpm: avgCpm,
        roas: roas
      }
    };
  });
  
  return res.json({
    success: true,
    data: {
      items: adsWithMetrics,
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil((count || 0) / limit)
    },
    metadata: {
      availableFields: [
        'campaign_id', 'campaign_name', 'platform', 'status', 'budget_daily', 
        'budget_total', 'start_date', 'end_date', 'target_audience'
      ],
      missingFields: []
    }
  });
}

async function createAdCampaign(req, res, supabase) {
  const {
    site_id,
    platform,
    campaign_id,
    campaign_name,
    objective,
    status = 'active',
    budget_daily,
    budget_total,
    start_date,
    end_date,
    target_audience = {}
  } = req.body;

  // 验证必填字段
  if (!site_id || !platform || !campaign_id || !campaign_name) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: site_id, platform, campaign_id, campaign_name'
    });
  }

  // 检查广告活动是否已存在
  const { data: existingCampaign, error: checkError } = await supabase
    .from('ad_campaigns')
    .select('id')
    .eq('site_id', site_id)
    .eq('platform', platform)
    .eq('campaign_id', campaign_id)
    .single();

  if (existingCampaign) {
    return res.status(400).json({
      success: false,
      message: 'Ad campaign already exists for this site, platform and campaign ID'
    });
  }

  try {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .insert({
        site_id,
        platform,
        campaign_id,
        campaign_name,
        objective,
        status,
        budget_daily,
        budget_total,
        start_date,
        end_date,
        target_audience
      })
      .select()
      .single();

    if (error) {
      console.error('Create ad campaign error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create ad campaign',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      data,
      message: 'Ad campaign created successfully'
    });

  } catch (error) {
    console.error('Create ad campaign transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create ad campaign',
      error: error.message
    });
  }
}

async function updateAdCampaign(req, res, supabase) {
  const { id } = req.query;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Ad campaign ID is required'
    });
  }

  // 移除不允许更新的字段
  delete updateData.id;
  delete updateData.created_at;
  delete updateData.site_id; // 站点ID不允许修改
  delete updateData.platform; // 平台不允许修改
  delete updateData.campaign_id; // 广告活动ID不允许修改

  const { data, error } = await supabase
    .from('ad_campaigns')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Update ad campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update ad campaign',
      error: error.message
    });
  }

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Ad campaign not found'
    });
  }

  return res.json({
    success: true,
    data,
    message: 'Ad campaign updated successfully'
  });
}

async function deleteAdCampaign(req, res, supabase) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Ad campaign ID is required'
    });
  }

  // 检查广告活动是否存在
  const { data: existingCampaign, error: checkError } = await supabase
    .from('ad_campaigns')
    .select('id, status')
    .eq('id', id)
    .single();

  if (checkError || !existingCampaign) {
    return res.status(404).json({
      success: false,
      message: 'Ad campaign not found'
    });
  }

  // 检查是否有广告数据
  const { data: metricsData, error: metricsError } = await supabase
    .from('ad_metrics_daily')
    .select('id')
    .eq('campaign_id', id)
    .limit(1);

  if (metricsData && metricsData.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete ad campaign with existing metrics data'
    });
  }

  // 删除广告活动
  const { error } = await supabase
    .from('ad_campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Delete ad campaign error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete ad campaign',
      error: error.message
    });
  }

  return res.json({
    success: true,
    message: 'Ad campaign deleted successfully'
  });
}
