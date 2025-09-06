-- 创建统一的Facebook Ads数据表
-- 支持所有独立站点的Facebook Ads数据存储

-- 1. 创建通用Facebook Ads数据表
CREATE TABLE IF NOT EXISTS public.independent_facebook_ads_daily (
  id bigserial NOT NULL,
  site text NOT NULL,                    -- 站点标识
  day date NOT NULL,                     -- 日期
  campaign_name text NOT NULL,           -- 广告系列名称
  adset_name text NOT NULL,              -- 广告组名称
  landing_url text,                      -- 落地页URL
  impressions bigint DEFAULT 0,          -- 展示次数
  clicks bigint DEFAULT 0,               -- 点击次数
  spend_usd numeric(14,4) DEFAULT 0,     -- 花费(USD)
  cpm numeric(10,4) DEFAULT 0,           -- 千次展示成本
  cpc_all numeric(10,4) DEFAULT 0,       -- 单次点击成本
  all_ctr numeric(10,6) DEFAULT 0,       -- 点击率
  reach bigint DEFAULT 0,                -- 覆盖人数
  frequency numeric(10,4) DEFAULT 0,     -- 频次
  all_clicks bigint DEFAULT 0,           -- 全部点击
  link_clicks bigint DEFAULT 0,          -- 链接点击
  link_ctr numeric(10,6) DEFAULT 0,      -- 链接点击率
  ic_web bigint DEFAULT 0,               -- 网站结账发起
  ic_meta bigint DEFAULT 0,              -- Meta结账发起
  ic_total bigint DEFAULT 0,             -- 总结账发起
  atc_web bigint DEFAULT 0,              -- 网站加购
  atc_meta bigint DEFAULT 0,             -- Meta加购
  atc_total bigint DEFAULT 0,            -- 总加购
  purchase_web bigint DEFAULT 0,         -- 网站购买
  purchase_meta bigint DEFAULT 0,        -- Meta购买
  cpa_purchase_web numeric(10,4) DEFAULT 0, -- 购买成本
  conversion_value numeric(14,4) DEFAULT 0, -- 转化价值
  row_start_date date,                   -- 报告开始日期
  row_end_date date,                     -- 报告结束日期
  inserted_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT independent_facebook_ads_daily_pkey PRIMARY KEY (id),
  CONSTRAINT independent_facebook_ads_daily_uniq UNIQUE (
    site, day, campaign_name, adset_name
  )
) TABLESPACE pg_default;

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_ind_fb_site_day 
ON public.independent_facebook_ads_daily (site, day);

CREATE INDEX IF NOT EXISTS idx_ind_fb_site_campaign 
ON public.independent_facebook_ads_daily (site, campaign_name);

CREATE INDEX IF NOT EXISTS idx_ind_fb_site_adset 
ON public.independent_facebook_ads_daily (site, adset_name);

CREATE INDEX IF NOT EXISTS idx_ind_fb_site_date_range 
ON public.independent_facebook_ads_daily (site, day, campaign_name);

-- 3. 迁移现有icyberite数据到统一表
INSERT INTO public.independent_facebook_ads_daily (
  site, day, campaign_name, adset_name, landing_url,
  impressions, clicks, spend_usd, cpm, cpc_all, all_ctr,
  reach, frequency, all_clicks, link_clicks, link_ctr,
  ic_web, ic_meta, ic_total, atc_web, atc_meta, atc_total,
  purchase_web, purchase_meta, cpa_purchase_web, conversion_value,
  row_start_date, row_end_date, inserted_at, updated_at
)
SELECT 
  site, day, campaign_name, adset_name, landing_url,
  impressions, clicks, spend_usd, cpm, cpc_all, all_ctr,
  reach, frequency, all_clicks, link_clicks, link_ctr,
  ic_web, ic_meta, ic_total, atc_web, atc_meta, atc_total,
  purchase_web, purchase_meta, cpa_purchase_web, conversion_value,
  row_start_date, row_end_date, created_at, updated_at
FROM public.independent_icyberite_facebook_ads_daily
ON CONFLICT (site, day, campaign_name, adset_name) DO NOTHING;

-- 4. 验证数据迁移结果
SELECT 
  'Data Migration Summary' as summary,
  COUNT(*) as total_records,
  COUNT(DISTINCT site) as unique_sites,
  MIN(day) as earliest_date,
  MAX(day) as latest_date
FROM public.independent_facebook_ads_daily;

-- 5. 显示各站点的数据统计
SELECT 
  site,
  COUNT(*) as record_count,
  MIN(day) as earliest_date,
  MAX(day) as latest_date,
  SUM(spend_usd) as total_spend,
  SUM(impressions) as total_impressions
FROM public.independent_facebook_ads_daily 
GROUP BY site
ORDER BY site;

-- 6. 创建TikTok Ads统一表（为未来扩展准备）
CREATE TABLE IF NOT EXISTS public.independent_tiktok_ads_daily (
  id bigserial NOT NULL,
  site text NOT NULL,
  day date NOT NULL,
  campaign_name text NOT NULL,
  adgroup_name text,
  landing_url text,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend_usd numeric(14,4) DEFAULT 0,
  cpm numeric(10,4) DEFAULT 0,
  cpc numeric(10,4) DEFAULT 0,
  ctr numeric(10,6) DEFAULT 0,
  reach bigint DEFAULT 0,
  frequency numeric(10,4) DEFAULT 0,
  conversions bigint DEFAULT 0,
  conversion_value numeric(14,4) DEFAULT 0,
  inserted_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT independent_tiktok_ads_daily_pkey PRIMARY KEY (id),
  CONSTRAINT independent_tiktok_ads_daily_uniq UNIQUE (
    site, day, campaign_name, adgroup_name
  )
) TABLESPACE pg_default;

-- 7. 创建TikTok Ads索引
CREATE INDEX IF NOT EXISTS idx_ind_tiktok_site_day 
ON public.independent_tiktok_ads_daily (site, day);

CREATE INDEX IF NOT EXISTS idx_ind_tiktok_site_campaign 
ON public.independent_tiktok_ads_daily (site, campaign_name);

-- 8. 完成提示
SELECT 'Unified Facebook Ads table created successfully!' as status;
