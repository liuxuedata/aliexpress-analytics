-- 检查数据库结构脚本
-- 用于验证当前数据库表结构和字段

-- 1. 检查 ae_self_operated_daily 表结构
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

-- 3. 检查索引
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'ae_self_operated_daily'
  AND schemaname = 'public';

-- 4. 检查数据样本
SELECT 
  site,
  product_id,
  stat_date,
  exposure,
  visitors
FROM ae_self_operated_daily 
LIMIT 5;

-- 5. 检查不同站点数量
SELECT 
  site,
  COUNT(*) as record_count
FROM ae_self_operated_daily 
GROUP BY site
ORDER BY record_count DESC;

-- 6. 检查 sites 表结构
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

-- 7. 检查 sites 表数据
SELECT * FROM sites ORDER BY created_at;

-- 8. 检查是否有数据但缺少 site 字段
-- 如果 site 字段不存在，这个查询会报错
SELECT 
  'Total records' as info,
  COUNT(*) as count
FROM ae_self_operated_daily
UNION ALL
SELECT 
  'Records with site field' as info,
  COUNT(*) as count
FROM ae_self_operated_daily
WHERE site IS NOT NULL;
