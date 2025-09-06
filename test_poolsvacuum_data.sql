-- 测试 poolsvacuum 数据是否存在
-- 检查独立站相关表的数据

-- 1. 检查 independent_landing_metrics 表
SELECT '=== independent_landing_metrics 表数据检查 ===' as info;

SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT site) as unique_sites,
  COUNT(DISTINCT day) as unique_days
FROM independent_landing_metrics;

-- 检查 poolsvacuum 的数据
SELECT 
  'poolsvacuum 数据统计' as site_info,
  COUNT(*) as total_records,
  COUNT(DISTINCT day) as unique_days,
  COUNT(DISTINCT landing_path) as unique_paths,
  MIN(day) as earliest_date,
  MAX(day) as latest_date
FROM independent_landing_metrics
WHERE site = 'poolsvacuum';

-- 查看 poolsvacuum 的样本数据
SELECT 
  day,
  landing_path,
  clicks,
  impr,
  cost,
  conversions,
  conv_value
FROM independent_landing_metrics 
WHERE site = 'poolsvacuum'
ORDER BY day DESC
LIMIT 10;

-- 2. 检查 independent_first_seen 表
SELECT '=== independent_first_seen 表数据检查 ===' as info;

SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT site) as unique_sites
FROM independent_first_seen;

-- 检查 poolsvacuum 的新产品数据
SELECT 
  'poolsvacuum 新产品统计' as site_info,
  COUNT(*) as total_new_products,
  MIN(first_seen_date) as earliest_first_seen,
  MAX(first_seen_date) as latest_first_seen
FROM independent_first_seen 
WHERE site = 'poolsvacuum';

-- 3. 检查 independent_landing_summary_by_day 视图
SELECT '=== independent_landing_summary_by_day 视图数据检查 ===' as info;

SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT site) as unique_sites
FROM independent_landing_summary_by_day;

-- 检查 poolsvacuum 的汇总数据
SELECT 
  'poolsvacuum 汇总数据统计' as site_info,
  COUNT(*) as total_days,
  MIN(day) as earliest_date,
  MAX(day) as latest_date,
  SUM(clicks) as total_clicks,
  SUM(impr) as total_impressions,
  SUM(cost) as total_cost,
  SUM(conversions) as total_conversions,
  SUM(conv_value) as total_conv_value
FROM independent_landing_summary_by_day
WHERE site = 'poolsvacuum';

-- 4. 检查所有独立站站点
SELECT '=== 所有独立站站点检查 ===' as info;

SELECT 
  site,
  COUNT(*) as records,
  MIN(day) as earliest_date,
  MAX(day) as latest_date
FROM independent_landing_metrics 
GROUP BY site
ORDER BY records DESC;

-- 5. 检查表结构
SELECT '=== 表结构检查 ===' as info;

-- 检查 independent_landing_metrics 表结构
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'independent_landing_metrics' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 6. 总结
SELECT '=== 数据检查总结 ===' as info;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM independent_landing_metrics WHERE site = 'poolsvacuum' LIMIT 1)
    THEN 'poolsvacuum 数据存在'
    ELSE 'poolsvacuum 数据不存在'
  END as poolsvacuum_data_status;
