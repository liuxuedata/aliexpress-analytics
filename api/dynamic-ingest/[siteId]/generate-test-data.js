// /api/dynamic-ingest/[siteId]/generate-test-data.js
// 生成测试数据的API端点
const { createClient } = require('@supabase/supabase-js');

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

    // 确定目标表名
    const tableName = `${siteId}_${siteConfig.data_source}_daily`;

    // 生成测试数据
    const testData = generateTestData(siteConfig);

    // 插入测试数据
    const { data, error: insertError } = await supabase
      .from(tableName)
      .insert(testData);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to insert test data: ' + insertError.message });
    }

    return res.status(200).json({
      ok: true,
      message: 'Test data generated successfully',
      inserted: data?.length || 0,
      table: tableName
    });

  } catch (error) {
    console.error('Generate test data error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// 根据数据源类型生成测试数据
function generateTestData(siteConfig) {
  const baseDate = new Date();
  const testData = [];

  switch (siteConfig.data_source) {
    case 'facebook_ads':
      for (let i = 0; i < 10; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - i);
        
        testData.push({
          site: siteConfig.name,
          campaign_name: `测试广告系列 ${i + 1}`,
          adset_name: `测试广告组 ${i + 1}`,
          level: 'adset',
          product_identifier: `PROD-${i + 1}`,
          reach: Math.floor(Math.random() * 10000) + 1000,
          impressions: Math.floor(Math.random() * 50000) + 5000,
          frequency: Math.random() * 5 + 1,
          link_clicks: Math.floor(Math.random() * 1000) + 100,
          all_clicks: Math.floor(Math.random() * 1200) + 120,
          all_ctr: Math.random() * 0.1 + 0.01,
          link_ctr: Math.random() * 0.08 + 0.008,
          cpc_link: Math.random() * 2 + 0.5,
          spend_usd: Math.random() * 500 + 50,
          atc_total: Math.floor(Math.random() * 50) + 5,
          atc_web: Math.floor(Math.random() * 30) + 3,
          atc_meta: Math.floor(Math.random() * 20) + 2,
          ic_total: Math.floor(Math.random() * 30) + 3,
          ic_web: Math.floor(Math.random() * 20) + 2,
          ic_meta: Math.floor(Math.random() * 10) + 1,
          purchase_web: Math.floor(Math.random() * 15) + 1,
          purchase_meta: Math.floor(Math.random() * 8) + 1,
          row_start_date: date.toISOString().split('T')[0],
          row_end_date: date.toISOString().split('T')[0],
          landing_url: `https://${siteConfig.domain || 'example.com'}/product-${i + 1}`,
          creative_name: `创意 ${i + 1}`,
          cpm: Math.random() * 20 + 5,
          cpc_all: Math.random() * 3 + 1,
          cpa_purchase_web: Math.random() * 50 + 20
        });
      }
      break;

    case 'google_ads':
      for (let i = 0; i < 10; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - i);
        
        testData.push({
          site: siteConfig.name,
          landing_url: `https://${siteConfig.domain || 'example.com'}/landing-${i + 1}`,
          campaign: `测试广告系列 ${i + 1}`,
          day: date.toISOString().split('T')[0],
          network: 'Google Search',
          device: 'Desktop',
          clicks: Math.floor(Math.random() * 500) + 50,
          impr: Math.floor(Math.random() * 10000) + 1000,
          ctr: Math.random() * 0.1 + 0.01,
          avg_cpc: Math.random() * 2 + 0.5,
          cost: Math.random() * 1000 + 100,
          conversions: Math.floor(Math.random() * 20) + 2,
          cost_per_conv: Math.random() * 50 + 20
        });
      }
      break;

    default:
      for (let i = 0; i < 10; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - i);
        
        testData.push({
          site: siteConfig.name,
          date: date.toISOString().split('T')[0],
          data: {
            metric1: Math.floor(Math.random() * 1000) + 100,
            metric2: Math.random() * 100 + 10,
            metric3: Math.floor(Math.random() * 50) + 5
          }
        });
      }
  }

  return testData;
}
