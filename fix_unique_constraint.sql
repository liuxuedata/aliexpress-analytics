-- 修复唯一约束问题
-- 为 dynamic_tables 表添加缺失的唯一约束

-- 1. 检查当前表结构
SELECT 
  table_name,
  column_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu 
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'dynamic_tables';

-- 2. 添加唯一约束（如果不存在）
DO $$
BEGIN
  -- 检查唯一约束是否已存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'dynamic_tables' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%site_id%'
  ) THEN
    -- 添加唯一约束
    ALTER TABLE public.dynamic_tables 
    ADD CONSTRAINT dynamic_tables_site_id_table_name_unique 
    UNIQUE (site_id, table_name);
    
    RAISE NOTICE 'Added unique constraint on (site_id, table_name)';
  ELSE
    RAISE NOTICE 'Unique constraint already exists';
  END IF;
END $$;

-- 3. 验证约束添加结果
SELECT 
  table_name,
  column_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu 
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'dynamic_tables'
ORDER BY constraint_type, constraint_name;

-- 4. 测试动态表生成函数
SELECT public.generate_dynamic_table(
  'independent_icyberite',
  'facebook_ads',
  '{
    "columns": {
      "adset_name": "text",
      "all_clicks": "integer",
      "all_ctr": "numeric(10,4)",
      "atc_meta": "integer",
      "atc_total": "integer",
      "atc_web": "integer",
      "campaign_name": "text",
      "cpa_purchase_web": "numeric(10,2)",
      "cpc_all": "numeric(10,2)",
      "cpc_link": "numeric(10,2)",
      "cpm": "numeric(10,2)",
      "creative_name": "text",
      "frequency": "numeric(10,2)",
      "ic_meta": "integer",
      "ic_total": "integer",
      "ic_web": "integer",
      "impressions": "integer",
      "landing_url": "text",
      "level": "text",
      "link_clicks": "integer",
      "link_ctr": "numeric(10,4)",
      "product_identifier": "text",
      "purchase_meta": "integer",
      "purchase_web": "integer",
      "reach": "integer",
      "row_end_date": "date",
      "row_start_date": "date",
      "site": "text not null",
      "spend_usd": "numeric(10,2)"
    }
  }'::jsonb
);

-- 5. 验证结果
SELECT 'Unique constraint fix completed' as status;
SELECT COUNT(*) as total_dynamic_tables FROM dynamic_tables;
