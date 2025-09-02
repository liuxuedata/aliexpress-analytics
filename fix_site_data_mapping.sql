-- 修复站点数据映射问题
-- 解决自运营数据表中站点标识不一致的问题

-- 1. 检查当前 ae_self_operated_daily 表中的站点分布
SELECT '=== 检查当前站点分布 ===' as info;

SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily
GROUP BY site
ORDER BY record_count DESC;

-- 2. 检查 site_configs 表中的自运营站点配置
SELECT '=== 检查自运营站点配置 ===' as info;

SELECT 
    id,
    name,
    platform,
    display_name,
    data_source
FROM site_configs
WHERE platform = 'ae_self_operated'
ORDER BY created_at;

-- 3. 更新 ae_self_operated_daily 表中的站点标识
-- 将 "A站" 更新为对应的 site_configs 中的 id
SELECT '=== 更新站点标识 ===' as info;

-- 更新自运营A站的数据
UPDATE ae_self_operated_daily 
SET site = 'ae_self_operated_a'
WHERE site = 'A站';

-- 4. 验证更新结果
SELECT '=== 验证更新结果 ===' as info;

SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily
GROUP BY site
ORDER BY record_count DESC;

-- 5. 检查是否有其他需要更新的站点标识
SELECT '=== 检查其他站点标识 ===' as info;

SELECT DISTINCT site 
FROM ae_self_operated_daily 
WHERE site NOT IN (
    SELECT id FROM site_configs WHERE platform = 'ae_self_operated'
);

-- 6. 确保所有自运营站点都有对应的数据表记录
SELECT '=== 确保数据表记录完整性 ===' as info;

-- 检查每个自运营站点是否有数据
SELECT 
    sc.id as site_id,
    sc.display_name,
    sc.platform,
    CASE 
        WHEN EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = sc.id)
        THEN '✅ 有数据'
        ELSE '❌ 无数据'
    END as data_status,
    (SELECT COUNT(*) FROM ae_self_operated_daily WHERE site = sc.id) as record_count
FROM site_configs sc
WHERE sc.platform = 'ae_self_operated'
ORDER BY sc.created_at;

-- 7. 测试查询验证
SELECT '=== 测试查询验证 ===' as info;

-- 测试查询自运营robot站的数据
SELECT 
    '自运营robot站数据查询测试' as test_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT product_id) as unique_products,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily
WHERE site = 'ae_self_operated_a';

-- 8. 最终验证
SELECT '=== 最终验证 ===' as info;

SELECT 
    '站点数据映射修复完成' as status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a')
        THEN '✅ robot站数据可查询'
        ELSE '❌ robot站数据不可查询'
    END as robot_site_check,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'A站')
        THEN '✅ 旧标识已清理'
        ELSE '❌ 旧标识仍存在'
    END as old_identifier_check,
    (SELECT COUNT(*) FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') as robot_site_records,
    (SELECT COUNT(*) FROM ae_self_operated_daily) as total_records;
