-- 检查和修复自运营数据表中的站点数据问题
-- 解决数据表中站点标识不一致的问题

-- 1. 检查当前数据表中的站点分布
SELECT '=== 检查当前数据表中的站点分布 ===' as info;
SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;

-- 2. 检查 site_configs 表中的配置
SELECT '=== 检查 site_configs 表配置 ===' as info;
SELECT 
    id,
    name,
    platform,
    display_name,
    data_source,
    created_at
FROM site_configs 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 3. 检查 sites 表中的配置
SELECT '=== 检查 sites 表配置 ===' as info;
SELECT 
    id,
    name,
    platform,
    display_name,
    created_at
FROM sites 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 4. 检查是否有 'A站' 标识的数据
SELECT '=== 检查 A站 标识的数据 ===' as info;
SELECT 
    COUNT(*) as a_site_records,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
WHERE site = 'A站';

-- 5. 检查是否有 'ae_self_operated_a' 标识的数据
SELECT '=== 检查 ae_self_operated_a 标识的数据 ===' as info;
SELECT 
    COUNT(*) as robot_site_records,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
WHERE site = 'ae_self_operated_a';

-- 6. 如果存在 'A站' 数据，将其更新为 'ae_self_operated_a'
SELECT '=== 更新站点标识 ===' as info;
UPDATE ae_self_operated_daily 
SET site = 'ae_self_operated_a'
WHERE site = 'A站';

-- 7. 验证更新结果
SELECT '=== 验证更新结果 ===' as info;
SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;

-- 8. 确保 site_configs 表中有正确的配置
SELECT '=== 确保 site_configs 表配置正确 ===' as info;
INSERT INTO site_configs (id, name, platform, display_name, domain, data_source, template_id, config_json) 
VALUES (
    'ae_self_operated_a', 
    'A站', 
    'ae_self_operated', 
    '自运营robot站', 
    NULL, 
    'ae_api', 
    NULL, 
    NULL
) ON CONFLICT (id) DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    data_source = EXCLUDED.data_source,
    updated_at = now();

-- 9. 确保 sites 表中有正确的配置
SELECT '=== 确保 sites 表配置正确 ===' as info;
INSERT INTO sites (id, name, platform, display_name) 
VALUES (
    'ae_self_operated_a', 
    'A站', 
    'ae_self_operated', 
    '自运营robot站'
) ON CONFLICT (id) DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    updated_at = now();

-- 10. 最终验证
SELECT '=== 最终验证 ===' as info;
SELECT 
    '数据修复完成' as status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') 
        THEN '✅ ae_self_operated_a 有数据'
        ELSE '❌ ae_self_operated_a 无数据'
    END as data_check,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'A站') 
        THEN '✅ A站 标识已清理'
        ELSE '❌ A站 标识仍存在'
    END as old_identifier_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM site_configs WHERE id = 'ae_self_operated_a') 
        THEN '✅ site_configs 配置正确'
        ELSE '❌ site_configs 配置缺失'
    END as site_config_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM sites WHERE id = 'ae_self_operated_a') 
        THEN '✅ sites 配置正确'
        ELSE '❌ sites 配置缺失'
    END as sites_check,
    (SELECT COUNT(*) FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') as robot_site_records,
    (SELECT COUNT(*) FROM ae_self_operated_daily) as total_records;
