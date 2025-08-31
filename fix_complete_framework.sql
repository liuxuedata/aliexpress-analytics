-- 完整修复脚本：解决所有已知问题
-- 包括表不存在、列引用不明确等问题

-- 1. 创建基础表结构（如果不存在）
CREATE TABLE IF NOT EXISTS public.site_configs (
  id          text primary key,
  name        text not null,
  platform    text not null,
  display_name text not null,
  domain      text,
  data_source text not null,
  template_id text,
  config_json jsonb,
  is_active   boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.data_source_templates (
  id          text primary key,
  name        text not null,
  platform    text not null,
  source_type text not null,
  fields_json jsonb not null,
  sample_file text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.dynamic_tables (
  id          text primary key,
  site_id     text references site_configs(id) on delete cascade,
  table_name  text not null,
  table_schema jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. 删除可能存在的错误表
DROP TABLE IF EXISTS public.independent_icyberite_facebook_ads_daily;

-- 3. 重新创建动态表生成函数（修复版本）
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
  
  -- 记录到动态表配置（使用明确的参数名避免歧义）
  INSERT INTO public.dynamic_tables (id, site_id, table_name, table_schema)
  VALUES (gen_random_uuid()::text, p_site_id, v_table_name, p_table_schema)
  ON CONFLICT (site_id, table_name) DO UPDATE SET
    table_schema = EXCLUDED.table_schema,
    updated_at = now();
  
  RETURN v_table_name;
END;
$$;

-- 4. 插入预定义的数据源模板
INSERT INTO public.data_source_templates (id, name, platform, source_type, fields_json) VALUES
('facebook_ads_v2025', 'Facebook Ads v2025', 'independent', 'facebook_ads', 
'{
  "mappings": {
    "广告系列名称": "campaign_name",
    "广告组名称": "adset_name",
    "投放层级": "level",
    "商品编号": "product_identifier",
    "覆盖人数": "reach",
    "展示次数": "impressions",
    "频次": "frequency",
    "链接点击量": "link_clicks",
    "点击量（全部）": "all_clicks",
    "点击率（全部）": "all_ctr",
    "链接点击率": "link_ctr",
    "单次链接点击费用": "cpc_link",
    "已花费金额 (USD)": "spend_usd",
    "加入购物车": "atc_total",
    "网站加入购物车": "atc_web",
    "Meta 加入购物车": "atc_meta",
    "结账发起次数": "ic_total",
    "网站结账发起次数": "ic_web",
    "Meta 结账发起次数": "ic_meta",
    "网站购物": "purchase_web",
    "Meta 内购物次数": "purchase_meta",
    "开始日期": "row_start_date",
    "结束日期": "row_end_date",
    "网址": "landing_url",
    "图片名称": "creative_name"
  },
  "calculated_fields": {
    "cpm": "spend_usd / impressions * 1000",
    "cpc_all": "spend_usd / NULLIF(all_clicks,0)",
    "cpa_purchase_web": "spend_usd / NULLIF(purchase_web,0)",
    "ctr_all": "all_ctr",
    "ctr_link": "link_ctr"
  },
  "required_fields": ["campaign_name", "impressions", "spend_usd"],
  "date_fields": ["row_start_date", "row_end_date"],
  "numeric_fields": ["reach", "impressions", "link_clicks", "spend_usd"]
}'
) ON CONFLICT (id) DO UPDATE SET 
  fields_json = EXCLUDED.fields_json,
  updated_at = now();

INSERT INTO public.data_source_templates (id, name, platform, source_type, fields_json) VALUES
('google_ads_landing_pages', 'Google Ads Landing Pages', 'independent', 'google_ads',
'{
  "mappings": {
    "Landing page": "landing_url",
    "Campaign": "campaign",
    "Day": "day",
    "Network (with search partners)": "network",
    "Device": "device",
    "Clicks": "clicks",
    "Impr.": "impr",
    "CTR": "ctr",
    "Avg. CPC": "avg_cpc",
    "Cost": "cost",
    "Conversions": "conversions",
    "Cost / conv.": "cost_per_conv"
  },
  "required_fields": ["landing_url", "campaign", "day"],
  "date_fields": ["day"],
  "numeric_fields": ["clicks", "impr", "cost", "conversions"]
}'
) ON CONFLICT (id) DO UPDATE SET 
  fields_json = EXCLUDED.fields_json,
  updated_at = now();

-- 5. 插入现有站点配置
INSERT INTO public.site_configs (id, name, platform, display_name, domain, data_source, template_id) VALUES
('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站', null, 'ae_api', null),
('independent_poolsvacuum', 'poolsvacuum.com', 'independent', '独立站 poolsvacuum.com', 'poolsvacuum.com', 'google_ads', 'google_ads_landing_pages'),
('independent_icyberite', 'icyberite.com', 'independent', '独立站 icyberite.com', 'icyberite.com', 'facebook_ads', 'facebook_ads_v2025')
ON CONFLICT (id) DO UPDATE SET 
  data_source = EXCLUDED.data_source,
  template_id = EXCLUDED.template_id,
  updated_at = now();

-- 6. 重新创建Facebook Ads数据表
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

-- 7. 设置RLS策略
ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dynamic_tables ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
DROP POLICY IF EXISTS p_site_configs_sel_all ON public.site_configs;
DROP POLICY IF EXISTS p_site_configs_ins_all ON public.site_configs;
DROP POLICY IF EXISTS p_site_configs_upd_all ON public.site_configs;

CREATE POLICY p_site_configs_sel_all ON public.site_configs FOR SELECT TO anon USING (true);
CREATE POLICY p_site_configs_ins_all ON public.site_configs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY p_site_configs_upd_all ON public.site_configs FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_data_source_templates_sel_all ON public.data_source_templates;
DROP POLICY IF EXISTS p_data_source_templates_ins_all ON public.data_source_templates;
DROP POLICY IF EXISTS p_data_source_templates_upd_all ON public.data_source_templates;

CREATE POLICY p_data_source_templates_sel_all ON public.data_source_templates FOR SELECT TO anon USING (true);
CREATE POLICY p_data_source_templates_ins_all ON public.data_source_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY p_data_source_templates_upd_all ON public.data_source_templates FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_dynamic_tables_sel_all ON public.dynamic_tables;
DROP POLICY IF EXISTS p_dynamic_tables_ins_all ON public.dynamic_tables;
DROP POLICY IF EXISTS p_dynamic_tables_upd_all ON public.dynamic_tables;

CREATE POLICY p_dynamic_tables_sel_all ON public.dynamic_tables FOR SELECT TO anon USING (true);
CREATE POLICY p_dynamic_tables_ins_all ON public.dynamic_tables FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY p_dynamic_tables_upd_all ON public.dynamic_tables FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 8. 创建索引
CREATE INDEX IF NOT EXISTS idx_site_configs_platform ON public.site_configs(platform);
CREATE INDEX IF NOT EXISTS idx_site_configs_data_source ON public.site_configs(data_source);
CREATE INDEX IF NOT EXISTS idx_data_source_templates_platform ON public.data_source_templates(platform);
CREATE INDEX IF NOT EXISTS idx_data_source_templates_source_type ON public.data_source_templates(source_type);

-- 9. 验证结果
SELECT 'Complete framework fix completed' as status;
SELECT COUNT(*) as total_site_configs FROM site_configs;
SELECT COUNT(*) as total_templates FROM data_source_templates;
SELECT COUNT(*) as total_dynamic_tables FROM dynamic_tables;

-- 10. 验证表创建结果
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'independent_icyberite_facebook_ads_daily'
ORDER BY ordinal_position;
