-- 修复 ae_self_operated_daily 表的默认值
-- 将 site 字段的默认值从 'A站' 改为 'ae_self_operated_a'

-- 1. 检查当前表结构
SELECT '=== 检查当前表结构 ===' as info;
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'ae_self_operated_daily' 
  AND column_name = 'site';

-- 2. 检查当前数据中的站点分布
SELECT '=== 检查当前数据分布 ===' as info;
SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;

-- 3. 修改表结构，更新默认值
SELECT '=== 修改表结构默认值 ===' as info;

-- 先删除默认值约束
ALTER TABLE public.ae_self_operated_daily 
ALTER COLUMN site DROP DEFAULT;

-- 重新设置默认值为 'ae_self_operated_a'
ALTER TABLE public.ae_self_operated_daily 
ALTER COLUMN site SET DEFAULT 'ae_self_operated_a';

-- 4. 验证修改结果
SELECT '=== 验证修改结果 ===' as info;
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'ae_self_operated_daily' 
  AND column_name = 'site';

-- 5. 确保所有现有数据都使用正确的站点标识
SELECT '=== 确保数据一致性 ===' as info;

-- 检查是否还有 'A站' 标识的数据
SELECT 
    'A站标识数据检查' as check_type,
    COUNT(*) as record_count
FROM ae_self_operated_daily 
WHERE site = 'A站';

-- 如果有 'A站' 数据，更新为 'ae_self_operated_a'
UPDATE ae_self_operated_daily 
SET site = 'ae_self_operated_a'
WHERE site = 'A站';

-- 6. 最终验证
SELECT '=== 最终验证 ===' as info;
SELECT 
    '表结构修复完成' as status,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = 'ae_self_operated_daily' 
              AND column_name = 'site'
              AND column_default = '''ae_self_operated_a''::text'
        )
        THEN '✅ 默认值已更新为 ae_self_operated_a'
        ELSE '❌ 默认值更新失败'
    END as default_value_check,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM ae_self_operated_daily WHERE site = 'A站')
        THEN '✅ 所有数据都使用 ae_self_operated_a'
        ELSE '❌ 仍有数据使用 A站 标识'
    END as data_consistency_check,
    (SELECT COUNT(*) FROM ae_self_operated_daily WHERE site = 'ae_self_operated_a') as robot_site_records,
    (SELECT COUNT(*) FROM ae_self_operated_daily) as total_records;

-- 7. 显示当前数据分布
SELECT '=== 当前数据分布 ===' as info;
SELECT 
    site,
    COUNT(*) as record_count,
    MIN(stat_date) as earliest_date,
    MAX(stat_date) as latest_date
FROM ae_self_operated_daily 
GROUP BY site 
ORDER BY record_count DESC;
