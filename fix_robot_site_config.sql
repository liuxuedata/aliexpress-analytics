-- 修复robot站点配置问题
-- 解决 ae_self_operated_a 站点在 site_configs 表中缺失的问题

-- 1. 检查当前 site_configs 表中的自运营站点
SELECT '=== 检查当前 site_configs 表 ===' as info;
SELECT id, name, platform, display_name, data_source, created_at 
FROM site_configs 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 2. 检查 sites 表中的自运营站点
SELECT '=== 检查 sites 表 ===' as info;
SELECT id, name, platform, display_name, created_at 
FROM sites 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 3. 添加缺失的 ae_self_operated_a 站点到 site_configs 表
SELECT '=== 添加缺失的站点配置 ===' as info;
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

-- 4. 验证修复结果
SELECT '=== 验证修复结果 ===' as info;
SELECT id, name, platform, display_name, data_source, created_at 
FROM site_configs 
WHERE platform = 'ae_self_operated' 
ORDER BY created_at;

-- 5. 检查 ae_self_operated_daily 表中的数据
SELECT '=== 检查数据表状态 ===' as info;
SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;

-- 6. 确保数据一致性
SELECT '=== 确保数据一致性 ===' as info;
SELECT 
    'site_configs 表中的自运营站点' as source,
    COUNT(*) as count
FROM site_configs 
WHERE platform = 'ae_self_operated'
UNION ALL
SELECT 
    'sites 表中的自运营站点' as source,
    COUNT(*) as count
FROM sites 
WHERE platform = 'ae_self_operated'
UNION ALL
SELECT 
    'ae_self_operated_daily 表中的站点' as source,
    COUNT(DISTINCT site) as count
FROM ae_self_operated_daily;

-- 7. 最终验证
SELECT '=== 最终验证 ===' as info;
SELECT 
    'robot站点配置修复完成' as status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM site_configs WHERE id = 'ae_self_operated_a') 
        THEN '✅ ae_self_operated_a 已存在于 site_configs 表'
        ELSE '❌ ae_self_operated_a 仍不存在于 site_configs 表'
    END as site_config_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM sites WHERE id = 'ae_self_operated_a') 
        THEN '✅ ae_self_operated_a 已存在于 sites 表'
        ELSE '❌ ae_self_operated_a 不存在于 sites 表'
    END as sites_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') 
        THEN '✅ ae_self_operated_a 有数据'
        ELSE '❌ ae_self_operated_a 无数据'
    END as data_check,
    (SELECT COUNT(*) FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') as robot_site_records;
