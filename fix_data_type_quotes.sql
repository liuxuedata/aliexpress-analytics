-- 修复数据类型引号问题
-- 这个问题是由于 jsonb_each 返回的值包含引号导致的

-- 1. 删除可能存在的错误表
DROP TABLE IF EXISTS public.independent_icyberite_facebook_ads_daily;

-- 2. 重新创建动态表生成函数（修复版本）
CREATE OR REPLACE FUNCTION public.generate_dynamic_table(
  site_id text,
  source_type text,
  table_schema jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  table_name text;
  column_defs text := '';
  field_name text;
  field_type text;
BEGIN
  -- 生成表名
  table_name := site_id || '_' || source_type || '_daily';
  
  -- 构建列定义（按字段名排序以确保一致性）
  FOR field_name, field_type IN 
    SELECT key, value::text 
    FROM jsonb_each(table_schema->'columns')
    ORDER BY key
  LOOP
    IF column_defs != '' THEN
      column_defs := column_defs || ', ';
    END IF;
    -- 移除数据类型名称周围的引号，确保正确的SQL语法
    column_defs := column_defs || field_name || ' ' || trim(both '"' from field_type);
  END LOOP;
  
  -- 创建表
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
    %s,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )', table_name, column_defs);
  
  -- 记录到动态表配置
  INSERT INTO public.dynamic_tables (id, site_id, table_name, table_schema)
  VALUES (gen_random_uuid()::text, site_id, table_name, table_schema)
  ON CONFLICT (site_id, table_name) DO UPDATE SET
    table_schema = EXCLUDED.table_schema,
    updated_at = now();
  
  RETURN table_name;
END;
$$;

-- 3. 重新创建Facebook Ads数据表
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

-- 4. 验证表创建结果
SELECT 'Data type quotes fix completed' as status;
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'independent_icyberite_facebook_ads_daily'
ORDER BY ordinal_position;
