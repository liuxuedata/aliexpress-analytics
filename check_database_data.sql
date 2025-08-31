-- 检查数据库中的自运营数据状态
-- 验证数据迁移是否成功

-- 1. 检查 ae_self_operated_daily 表中的站点分布
SELECT '=== 检查 ae_self_operated_daily 表站点分布 ===' as info;
SELECT site, COUNT(*) as record_count, MIN(stat_date) as earliest_date, MAX(stat_date) as latest_date 
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;

-- 2. 检查是否有任何数据
SELECT '=== 检查是否有数据 ===' as info;
SELECT COUNT(*) as total_records FROM ae_self_operated_daily;

-- 3. 检查 site_configs 表中的自运营站点配置
SELECT '=== 检查自运营站点配置 ===' as info;
SELECT id, name, platform, display_name, data_source, created_at 
FROM site_configs 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 4. 检查特定站点的数据
SELECT '=== 检查 ae_self_operated_a 站点数据 ===' as info;
SELECT COUNT(*) as record_count, 
       MIN(stat_date) as earliest_date, 
       MAX(stat_date) as latest_date,
       COUNT(DISTINCT product_id) as unique_products
FROM ae_self_operated_daily 
WHERE site = 'ae_self_operated_a';

-- 5. 检查是否还有 A站 标识的数据
SELECT '=== 检查是否还有 A站 标识 ===' as info;
SELECT COUNT(*) as a_site_records 
FROM ae_self_operated_daily 
WHERE site = 'A站';

-- 6. 显示前几条记录用于调试
SELECT '=== 前5条记录示例 ===' as info;
SELECT site, product_id, stat_date, exposure, visitors, views 
FROM ae_self_operated_daily 
ORDER BY stat_date DESC 
LIMIT 5;

-- 7. 检查所有不同的站点标识
SELECT '=== 所有不同的站点标识 ===' as info;
SELECT DISTINCT site FROM ae_self_operated_daily ORDER BY site;
