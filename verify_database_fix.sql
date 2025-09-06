-- 验证数据库修复结果脚本
-- 运行此脚本来确认数据库结构是否正确

-- 1. 检查 ae_self_operated_daily 表结构
SELECT '=== 检查 ae_self_operated_daily 表结构 ===' as info;

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default,
  ordinal_position
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'ae_self_operated_daily'
ORDER BY ordinal_position;

-- 2. 检查主键约束
SELECT '=== 检查主键约束 ===' as info;

SELECT 
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'ae_self_operated_daily'
  AND tc.constraint_type = 'PRIMARY KEY';

-- 3. 检查数据样本
SELECT '=== 检查数据样本 ===' as info;

SELECT 
  site,
  product_id,
  stat_date,
  exposure,
  visitors
FROM ae_self_operated_daily 
LIMIT 5;

-- 4. 检查不同站点数量
SELECT '=== 检查站点数据分布 ===' as info;

SELECT 
  site,
  COUNT(*) as record_count
FROM ae_self_operated_daily 
GROUP BY site
ORDER BY record_count DESC;

-- 5. 检查 sites 表结构
SELECT '=== 检查 sites 表结构 ===' as info;

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default,
  ordinal_position
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'sites'
ORDER BY ordinal_position;

-- 6. 检查 sites 表数据
SELECT '=== 检查 sites 表数据 ===' as info;

SELECT * FROM sites ORDER BY created_at;

-- 7. 检查独立站相关表
SELECT '=== 检查独立站相关表 ===' as info;

-- 检查 independent_landing_metrics 表
SELECT 
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'independent_landing_metrics') 
    THEN 'independent_landing_metrics 表存在' 
    ELSE 'independent_landing_metrics 表不存在' 
  END as table_status;

-- 检查 independent_first_seen 表
SELECT 
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'independent_first_seen') 
    THEN 'independent_first_seen 表存在' 
    ELSE 'independent_first_seen 表不存在' 
  END as table_status;

-- 8. 检查视图
SELECT '=== 检查视图 ===' as info;

SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'v_ae_self_operated_%'
ORDER BY table_name;

-- 9. 检查索引
SELECT '=== 检查索引 ===' as info;

SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'ae_self_operated_daily'
  AND schemaname = 'public';

-- 10. 检查RLS策略
SELECT '=== 检查RLS策略 ===' as info;

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('ae_self_operated_daily', 'sites')
ORDER BY tablename, policyname;

-- 11. 测试查询
SELECT '=== 测试查询 ===' as info;

-- 测试查询自运营数据
SELECT 
  '自运营数据查询测试' as test_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT site) as unique_sites,
  COUNT(DISTINCT product_id) as unique_products
FROM ae_self_operated_daily 
WHERE site = 'ae_self_operated_a';

-- 测试查询独立站数据
SELECT 
  '独立站数据查询测试' as test_name,
  COUNT(*) as total_records
FROM independent_landing_metrics
WHERE site = 'poolsvacuum'
LIMIT 1;

-- 12. 总结
SELECT '=== 修复验证总结 ===' as info;

SELECT 
  '数据库结构修复验证完成' as status,
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily' AND column_name = 'site')
    THEN '✅ site字段存在'
    ELSE '❌ site字段缺失'
  END as site_field_check,
  CASE 
    WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites')
    THEN '✅ sites表存在'
    ELSE '❌ sites表缺失'
  END as sites_table_check,
  (SELECT COUNT(*) FROM sites) as sites_count,
  (SELECT COUNT(*) FROM ae_self_operated_daily) as data_records_count;
