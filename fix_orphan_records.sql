                                -- 修复孤立记录和数据不一致问题
                                -- 解决 sites 表中有5条记录，site_configs 表中有4条记录的问题

                                -- 1. 查看具体的孤立记录
                                SELECT '=== 查看孤立记录详情 ===' as info;

                                -- 查看 sites 表中存在但 site_configs 中不存在的记录
                                SELECT 
                                    'sites 表中的孤立记录' as record_type,
                                    s.id,
                                    s.name,
                                    s.platform,
                                    s.display_name,
                                    s.created_at
                                FROM sites s
                                LEFT JOIN site_configs sc ON s.id = sc.id
                                WHERE sc.id IS NULL;

                                -- 2. 查看 site_configs 表中存在但 sites 中不存在的记录
SELECT 
    'site_configs 表中的孤立记录' as record_type,
    sc.id,
    sc.name,
    sc.platform,
    sc.display_name,
    sc.created_at
FROM site_configs sc
LEFT JOIN sites s ON sc.id = s.id
WHERE s.id IS NULL;

-- 3. 删除 sites 表中的孤立记录（只保留在 site_configs 中存在的记录）
DELETE FROM sites 
WHERE id NOT IN (SELECT id FROM site_configs);

-- 4. 重新同步 site_configs 到 sites 表
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

-- 5. 验证修复结果
SELECT '=== 修复后的验证 ===' as info;

SELECT 
    '数据修复完成' as status,
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

-- 6. 显示最终的站点数据
SELECT '=== 最终的 sites 表数据 ===' as info;
SELECT * FROM sites ORDER BY created_at;

SELECT '=== 最终的 site_configs 表数据 ===' as info;
SELECT * FROM site_configs ORDER BY created_at;
