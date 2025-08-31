-- 同步站点表数据脚本
-- 解决 sites 表和 site_configs 表数据不一致的问题

-- 1. 检查当前两个表的数据
SELECT '=== 检查 sites 表数据 ===' as info;
SELECT * FROM sites ORDER BY created_at;

SELECT '=== 检查 site_configs 表数据 ===' as info;
SELECT * FROM site_configs ORDER BY created_at;

-- 2. 同步 site_configs 到 sites 表
-- 将 site_configs 中的数据同步到 sites 表
INSERT INTO sites (id, name, platform, display_name, is_active, created_at, updated_at)
SELECT 
    id,
    name,
    platform,
    display_name,
    COALESCE(is_active, true) as is_active,
    COALESCE(created_at, now()) as created_at,
    COALESCE(updated_at, now()) as updated_at
FROM site_configs
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    platform = EXCLUDED.platform,
    display_name = EXCLUDED.display_name,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- 3. 检查同步结果
SELECT '=== 同步后的 sites 表数据 ===' as info;
SELECT * FROM sites ORDER BY created_at;

-- 4. 验证数据一致性
SELECT '=== 数据一致性检查 ===' as info;

-- 检查是否有 site_configs 中存在但 sites 中不存在的记录
SELECT 
    'site_configs 中存在但 sites 中不存在的记录' as check_type,
    sc.id,
    sc.name,
    sc.platform,
    sc.display_name
FROM site_configs sc
LEFT JOIN sites s ON sc.id = s.id
WHERE s.id IS NULL;

-- 检查是否有 sites 中存在但 site_configs 中不存在的记录
SELECT 
    'sites 中存在但 site_configs 中不存在的记录' as check_type,
    s.id,
    s.name,
    s.platform,
    s.display_name
FROM sites s
LEFT JOIN site_configs sc ON s.id = sc.id
WHERE sc.id IS NULL;

-- 5. 统计信息
SELECT '=== 统计信息 ===' as info;

SELECT 
    'sites 表记录数' as table_name,
    COUNT(*) as record_count
FROM sites
UNION ALL
SELECT 
    'site_configs 表记录数' as table_name,
    COUNT(*) as record_count
FROM site_configs;

-- 6. 按平台统计
SELECT '=== 按平台统计 ===' as info;

SELECT 
    'sites 表按平台统计' as source,
    platform,
    COUNT(*) as count
FROM sites
GROUP BY platform
UNION ALL
SELECT 
    'site_configs 表按平台统计' as source,
    platform,
    COUNT(*) as count
FROM site_configs
GROUP BY platform
ORDER BY source, platform;

-- 7. 清理孤立的 sites 记录（可选）
-- 如果 site_configs 中没有对应的记录，可以选择删除 sites 中的记录
-- 注意：这个操作会删除数据，请谨慎使用
/*
DELETE FROM sites 
WHERE id NOT IN (SELECT id FROM site_configs);
*/

-- 8. 最终验证
SELECT '=== 最终验证 ===' as info;

SELECT 
    '数据同步完成' as status,
    CASE 
        WHEN (SELECT COUNT(*) FROM sites) = (SELECT COUNT(*) FROM site_configs)
        THEN '✅ 记录数一致'
        ELSE '❌ 记录数不一致'
    END as record_count_check,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM sites s
            LEFT JOIN site_configs sc ON s.id = sc.id
            WHERE sc.id IS NULL
        )
        THEN '✅ 无孤立记录'
        ELSE '❌ 存在孤立记录'
    END as orphan_check,
    (SELECT COUNT(*) FROM sites) as sites_count,
    (SELECT COUNT(*) FROM site_configs) as site_configs_count;
