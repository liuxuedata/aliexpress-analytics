// /api/test-data-isolation.js
// 测试数据隔离问题的接口
import { createClient } from "@supabase/supabase-js";

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getClient();
    const { site } = req.query;
    
    console.log('测试数据隔离 - 请求站点:', site);
    
    // 测试不同站点的数据
    const testResults = {};
    
    // 1. 测试ae_self_operated_a站点
    const { data: siteA, error: errorA } = await supabase
      .from('ae_self_operated_daily')
      .select('product_id, exposure, visitors, add_count, add_people, pay_orders, pay_buyers, pay_items')
      .eq('site', 'ae_self_operated_a')
      .gte('stat_date', '2025-01-01')
      .limit(10);
    
    testResults.ae_self_operated_a = {
      count: siteA?.length || 0,
      error: errorA?.message,
      sample: siteA?.slice(0, 3) || []
    };
    
    // 2. 测试ae_self_operated_poolslab站点
    const { data: sitePoolslab, error: errorPoolslab } = await supabase
      .from('ae_self_operated_daily')
      .select('product_id, exposure, visitors, add_count, add_people, pay_orders, pay_buyers, pay_items')
      .eq('site', 'ae_self_operated_poolslab')
      .gte('stat_date', '2025-01-01')
      .limit(10);
    
    testResults.ae_self_operated_poolslab = {
      count: sitePoolslab?.length || 0,
      error: errorPoolslab?.message,
      sample: sitePoolslab?.slice(0, 3) || []
    };
    
    // 3. 测试全托管数据
    const { data: managedData, error: errorManaged } = await supabase
      .from('managed_stats')
      .select('product_id, search_exposure, uv, add_to_cart_users, pay_buyers')
      .gte('period_end', '2025-01-01')
      .limit(10);
    
    testResults.managed_stats = {
      count: managedData?.length || 0,
      error: errorManaged?.message,
      sample: managedData?.slice(0, 3) || []
    };
    
    // 4. 测试当前请求的站点
    if (site) {
      const { data: currentSite, error: currentError } = await supabase
        .from('ae_self_operated_daily')
        .select('product_id, exposure, visitors, add_count, add_people, pay_orders, pay_buyers, pay_items')
        .eq('site', site)
        .gte('stat_date', '2025-01-01')
        .limit(10);
      
      testResults.current_site = {
        site,
        count: currentSite?.length || 0,
        error: currentError?.message,
        sample: currentSite?.slice(0, 3) || []
      };
    }
    
    // 5. 获取所有站点列表
    const { data: allSites, error: sitesError } = await supabase
      .from('ae_self_operated_daily')
      .select('site')
      .gte('stat_date', '2025-01-01');
    
    const uniqueSites = [...new Set(allSites?.map(r => r.site) || [])];
    
    testResults.all_sites = {
      sites: uniqueSites,
      total_records: allSites?.length || 0,
      error: sitesError?.message
    };
    
    return res.status(200).json({
      ok: true,
      test_results: testResults,
      summary: {
        site_a_records: testResults.ae_self_operated_a.count,
        poolslab_records: testResults.ae_self_operated_poolslab.count,
        managed_records: testResults.managed_stats.count,
        total_sites: uniqueSites.length
      }
    });
    
  } catch (error) {
    console.error('测试数据隔离错误:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
