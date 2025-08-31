-- 修复 updated_at 字段缺失问题
-- 这个脚本会检查并添加缺失的 updated_at 字段

DO $$
BEGIN
  -- 检查并添加 data_source_templates 表的 updated_at 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'data_source_templates' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.data_source_templates ADD COLUMN updated_at timestamptz not null default now();
    RAISE NOTICE 'Added updated_at column to data_source_templates table';
  ELSE
    RAISE NOTICE 'updated_at column already exists in data_source_templates table';
  END IF;

  -- 检查并添加 dynamic_tables 表的 updated_at 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dynamic_tables' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.dynamic_tables ADD COLUMN updated_at timestamptz not null default now();
    RAISE NOTICE 'Added updated_at column to dynamic_tables table';
  ELSE
    RAISE NOTICE 'updated_at column already exists in dynamic_tables table';
  END IF;

  -- 检查并添加 site_configs 表的 updated_at 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'site_configs' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.site_configs ADD COLUMN updated_at timestamptz not null default now();
    RAISE NOTICE 'Added updated_at column to site_configs table';
  ELSE
    RAISE NOTICE 'updated_at column already exists in site_configs table';
  END IF;

END $$;

-- 验证修复结果
SELECT 'Updated columns check completed' as status;
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('data_source_templates', 'dynamic_tables', 'site_configs')
  AND column_name = 'updated_at'
ORDER BY table_name;
