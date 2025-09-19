const { normalizeRange, toNumber, toCurrency } = require('./lazada-utils');
const { ensureAccessToken } = require('./lazada-auth');
const { resolveApiHost, callLazadaApi } = require('./lazada-api');
const { getSiteConfig } = require('./lazada-orders');

function mapCampaign(record, { siteId, platform = 'lazada' }) {
  if (!record) return null;
  const campaignId = record.campaign_id || record.id || record.campaignId;
  if (!campaignId) return null;
  return {
    site_id: siteId,
    platform,
    campaign_id: String(campaignId),
    campaign_name: record.campaign_name || record.name || `Campaign ${campaignId}`,
    objective: record.objective || record.type || null,
    status: String(record.status || 'active').toLowerCase(),
    budget_daily: record.daily_budget !== undefined ? toCurrency(record.daily_budget) : null,
    budget_total: record.total_budget !== undefined ? toCurrency(record.total_budget) : null,
    start_date: record.start_time ? String(record.start_time).slice(0, 10) : null,
    end_date: record.end_time ? String(record.end_time).slice(0, 10) : null,
    target_audience: record.target_audience || record.audience || null
  };
}

function mapMetric(record, { siteId, platform = 'lazada' }) {
  if (!record) return null;
  const campaignId = record.campaign_id || record.id || record.campaignId;
  if (!campaignId) return null;
  const date = record.date || record.stat_date || record.day;
  if (!date) return null;

  return {
    campaign_key: String(campaignId),
    site_id: siteId,
    platform,
    date: String(date).slice(0, 10),
    impressions: toNumber(record.impressions),
    clicks: toNumber(record.clicks),
    spend: toCurrency(record.spend || record.cost),
    conversions: toNumber(record.conversions || record.orders),
    conversion_value: toCurrency(record.conversion_value || record.revenue || record.gmv),
    ctr: record.ctr !== undefined ? Number(record.ctr) : null,
    cpc: record.cpc !== undefined ? toCurrency(record.cpc) : null,
    cpm: record.cpm !== undefined ? toCurrency(record.cpm) : null,
    roas: record.roas !== undefined ? Number(record.roas) : null
  };
}

async function fetchCampaigns({ fetchImpl, supabase, siteConfig, siteId, from, to }) {
  const access = await ensureAccessToken({ supabase, siteId, fetchImpl });
  const host = resolveApiHost(siteConfig);

  const [campaignPayload, metricPayload] = await Promise.all([
    callLazadaApi({
      fetchImpl,
      accessToken: access.accessToken,
      host,
      path: '/marketing/campaign/list',
      params: { status: 'all' }
    }),
    callLazadaApi({
      fetchImpl,
      accessToken: access.accessToken,
      host,
      path: '/marketing/campaign/metrics',
      params: {
        start_date: from.slice(0, 10),
        end_date: to.slice(0, 10)
      }
    }).catch(err => {
      console.warn('[lazada] campaign metrics unavailable', err.message);
      return { data: [] };
    })
  ]);

  const campaigns = Array.isArray(campaignPayload?.data?.campaigns)
    ? campaignPayload.data.campaigns
    : Array.isArray(campaignPayload?.data)
      ? campaignPayload.data
      : Array.isArray(campaignPayload?.result)
        ? campaignPayload.result
        : [];

  const metrics = Array.isArray(metricPayload?.data?.records)
    ? metricPayload.data.records
    : Array.isArray(metricPayload?.data)
      ? metricPayload.data
      : Array.isArray(metricPayload?.result)
        ? metricPayload.result
        : [];

  return { campaigns, metrics };
}

async function persistCampaigns(supabase, campaigns) {
  if (!campaigns.length) return new Map();
  const { data, error } = await supabase
    .schema('public')
    .from('ad_campaigns')
    .upsert(campaigns, { onConflict: 'site_id,platform,campaign_id' })
    .select();

  if (error) {
    throw new Error(`Supabase 写入广告系列失败：${error.message}`);
  }

  const map = new Map();
  (data || []).forEach(row => {
    if (row?.campaign_id && row?.id) {
      map.set(row.campaign_id, row.id);
    }
  });
  return map;
}

async function persistMetrics(supabase, metrics, campaignMap) {
  if (!metrics.length || !campaignMap || !campaignMap.size) return 0;

  const rows = metrics
    .map(metric => {
      const campaignId = campaignMap.get(metric.campaign_key);
      if (!campaignId) return null;
      return {
        campaign_id: campaignId,
        site_id: metric.site_id,
        platform: metric.platform,
        date: metric.date,
        impressions: metric.impressions,
        clicks: metric.clicks,
        spend: metric.spend,
        conversions: metric.conversions,
        conversion_value: metric.conversion_value,
        ctr: metric.ctr,
        cpc: metric.cpc,
        cpm: metric.cpm,
        roas: metric.roas
      };
    })
    .filter(Boolean);

  if (!rows.length) return 0;

  const { error } = await supabase
    .schema('public')
    .from('ad_metrics_daily')
    .upsert(rows, { onConflict: 'campaign_id,date' });

  if (error) {
    throw new Error(`Supabase 写入广告指标失败：${error.message}`);
  }
  return rows.length;
}

async function queryCampaigns(supabase, { siteId, from, to }) {
  const { data: campaigns, error: campaignError } = await supabase
    .schema('public')
    .from('ad_campaigns')
    .select('*')
    .eq('platform', 'lazada')
    .eq('site_id', siteId)
    .order('campaign_name', { ascending: true });

  if (campaignError) {
    throw new Error(`Supabase 查询广告系列失败：${campaignError.message}`);
  }

  const { data: metrics, error: metricError } = await supabase
    .schema('public')
    .from('ad_metrics_daily')
    .select('*')
    .eq('platform', 'lazada')
    .eq('site_id', siteId)
    .gte('date', from.slice(0, 10))
    .lte('date', to.slice(0, 10));

  if (metricError) {
    throw new Error(`Supabase 查询广告指标失败：${metricError.message}`);
  }

  const metricMap = new Map();
  (metrics || []).forEach(row => {
    const list = metricMap.get(row.campaign_id) || [];
    list.push(row);
    metricMap.set(row.campaign_id, list);
  });

  return (campaigns || []).map(campaign => ({
    ...campaign,
    metrics: metricMap.get(campaign.id) || []
  }));
}

async function syncLazadaAds({
  fetchImpl,
  supabase,
  siteId,
  from,
  to,
  shouldSync = true
}) {
  if (!supabase) {
    throw new Error('Supabase client is required');
  }
  if (!siteId) {
    throw new Error('缺少 siteId 参数');
  }

  const { from: normalizedFrom, to: normalizedTo } = normalizeRange(from, to);
  const siteConfig = await getSiteConfig(supabase, siteId);
  if (!siteConfig) {
    const err = new Error(`未找到 Lazada 站点配置：${siteId}`);
    err.code = 'SITE_NOT_FOUND';
    err.missingSites = [siteId];
    throw err;
  }

  if (shouldSync) {
    const { campaigns, metrics } = await fetchCampaigns({
      fetchImpl,
      supabase,
      siteConfig,
      siteId,
      from: normalizedFrom,
      to: normalizedTo
    });

    const mappedCampaigns = (campaigns || [])
      .map(record => mapCampaign(record, { siteId }))
      .filter(Boolean)
      .map(row => ({ ...row, platform: 'lazada' }));

    const mappedMetrics = (metrics || [])
      .map(record => mapMetric(record, { siteId }))
      .filter(Boolean)
      .map(row => ({ ...row, platform: 'lazada' }));

    const campaignMap = await persistCampaigns(supabase, mappedCampaigns);
    if (mappedMetrics.length) {
      mappedMetrics.forEach(metric => {
        metric.site_id = siteId;
      });
      await persistMetrics(supabase, mappedMetrics, campaignMap);
    }
  }

  const campaigns = await queryCampaigns(supabase, {
    siteId,
    from: normalizedFrom,
    to: normalizedTo
  });

  return { campaigns };
}

module.exports = {
  syncLazadaAds,
  mapCampaign,
  mapMetric
};
