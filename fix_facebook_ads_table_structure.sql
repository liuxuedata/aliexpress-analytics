-- 修复 Facebook Ads 表结构，添加缺失的字段
-- 特别是 conversion_value 字段

-- 1. 删除可能存在的错误表
DROP TABLE IF EXISTS public.independent_icyberite_facebook_ads_daily;

-- 2. 重新创建动态表生成函数（确保支持所有字段）
CREATE OR REPLACE FUNCTION public.generate_dynamic_table(
  p_site_id text,
  p_source_type text,
  p_table_schema jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_table_name text;
  v_column_defs text := '';
  v_field_name text;
  v_field_type text;
BEGIN
  -- 生成表名
  v_table_name := p_site_id || '_' || p_source_type || '_daily';
  
  -- 构建列定义（按字段名排序以确保一致性）
  FOR v_field_name, v_field_type IN 
    SELECT key, value::text 
    FROM jsonb_each(p_table_schema->'columns')
    ORDER BY key
  LOOP
    IF v_column_defs != '' THEN
      v_column_defs := v_column_defs || ', ';
    END IF;
    -- 移除数据类型名称周围的引号，确保正确的SQL语法
    v_column_defs := v_column_defs || v_field_name || ' ' || trim(both '"' from v_field_type);
  END LOOP;
  
  -- 创建表
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
    %s,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )', v_table_name, v_column_defs);
  
  -- 记录到动态表配置
  INSERT INTO public.dynamic_tables (id, site_id, table_name, table_schema)
  VALUES (gen_random_uuid()::text, p_site_id, v_table_name, p_table_schema)
  ON CONFLICT (site_id, table_name) DO UPDATE SET
    table_schema = EXCLUDED.table_schema,
    updated_at = now();
  
  RETURN v_table_name;
END;
$$;

-- 3. 重新创建 Facebook Ads 数据表（包含所有必需字段）
SELECT public.generate_dynamic_table(
  'independent_icyberite',
  'facebook_ads',
  '{
    "columns": {
      "site": "text not null",
      "day": "date not null",
      "campaign_name": "text",
      "adset_name": "text",
      "landing_url": "text",
      "impressions": "integer",
      "clicks": "integer",
      "spend_usd": "numeric(10,2)",
      "cpm": "numeric(10,2)",
      "cpc_all": "numeric(10,2)",
      "all_ctr": "numeric(10,4)",
      "reach": "integer",
      "frequency": "numeric(10,2)",
      "all_clicks": "integer",
      "link_clicks": "integer",
      "ic_web": "integer",
      "ic_meta": "integer",
      "ic_total": "integer",
      "atc_web": "integer",
      "atc_meta": "integer",
      "atc_total": "integer",
      "purchase_web": "integer",
      "purchase_meta": "integer",
      "cpa_purchase_web": "numeric(10,2)",
      "link_ctr": "numeric(10,4)",
      "conversion_value": "numeric(10,2)",
      "row_start_date": "date",
      "row_end_date": "date"
    }
  }'::jsonb
);

-- 4. 创建主键和索引
ALTER TABLE public.independent_icyberite_facebook_ads_daily 
ADD CONSTRAINT pk_independent_icyberite_facebook_ads_daily 
PRIMARY KEY (site, day, campaign_name, adset_name);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_independent_icyberite_facebook_ads_daily_site_day 
ON public.independent_icyberite_facebook_ads_daily (site, day);

CREATE INDEX IF NOT EXISTS idx_independent_icyberite_facebook_ads_daily_campaign 
ON public.independent_icyberite_facebook_ads_daily (campaign_name);

-- 5. 验证表创建结果
SELECT 'Facebook Ads table structure updated successfully' as status;

SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'independent_icyberite_facebook_ads_daily'
ORDER BY ordinal_position;
