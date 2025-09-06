-- 创建完整的Facebook Ads数据表
-- 包含所有Facebook Ads报告中的字段

CREATE TABLE IF NOT EXISTS public.independent_facebook_ads_daily (
    id SERIAL PRIMARY KEY,
    site TEXT NOT NULL,
    day DATE NOT NULL,
    
    -- 基础信息字段
    campaign_name TEXT,
    adset_name TEXT,
    ad_name TEXT,
    
    -- 投放相关字段
    delivery_status TEXT, -- 投放状态
    delivery_level TEXT, -- 投放层级
    attribution_setting TEXT, -- 归因设置
    objective TEXT, -- 成效类型
    
    -- 核心指标字段
    impressions BIGINT DEFAULT 0, -- 展示次数
    reach BIGINT DEFAULT 0, -- 覆盖人数
    frequency DECIMAL(10,2) DEFAULT 0, -- 频次
    clicks BIGINT DEFAULT 0, -- 点击量（全部）
    link_clicks BIGINT DEFAULT 0, -- 链接点击量
    unique_link_clicks BIGINT DEFAULT 0, -- 链接点击量 - 独立用户
    unique_clicks BIGINT DEFAULT 0, -- 点击量（全部）- 独立用户
    
    -- 点击率字段
    ctr_all DECIMAL(10,4) DEFAULT 0, -- 点击率（全部）
    link_ctr DECIMAL(10,4) DEFAULT 0, -- 链接点击率
    unique_ctr_all DECIMAL(10,4) DEFAULT 0, -- 点击率（全部）- 独立用户
    
    -- 费用相关字段
    spend_usd DECIMAL(15,2) DEFAULT 0, -- 已花费金额 (USD)
    cpc_all DECIMAL(10,2) DEFAULT 0, -- 单次点击费用
    cpc_link DECIMAL(10,2) DEFAULT 0, -- 单次链接点击费用
    cpm DECIMAL(10,2) DEFAULT 0, -- 千次展示费用
    
    -- 转化相关字段
    results BIGINT DEFAULT 0, -- 成效
    cost_per_result DECIMAL(10,2) DEFAULT 0, -- 单次成效费用
    
    -- 购物车相关字段
    atc_total BIGINT DEFAULT 0, -- 加入购物车
    atc_web BIGINT DEFAULT 0, -- 网站加入购物车
    atc_meta BIGINT DEFAULT 0, -- Meta 加入购物车
    
    -- 心愿单字段
    wishlist_adds BIGINT DEFAULT 0, -- 加入心愿单次数
    
    -- 结账相关字段
    ic_total BIGINT DEFAULT 0, -- 结账发起次数
    ic_web BIGINT DEFAULT 0, -- 网站结账发起次数
    ic_meta BIGINT DEFAULT 0, -- Meta 结账发起次数
    
    -- 购物相关字段
    purchases BIGINT DEFAULT 0, -- 购物次数
    purchases_web BIGINT DEFAULT 0, -- 网站购物
    purchases_meta BIGINT DEFAULT 0, -- Meta 内购物次数
    
    -- 店铺相关字段
    store_clicks BIGINT DEFAULT 0, -- 店铺点击量
    
    -- 页面浏览字段
    page_views BIGINT DEFAULT 0, -- 浏览量
    
    -- 日期字段
    row_start_date DATE, -- 开始日期
    row_end_date DATE, -- 结束日期
    report_start_date DATE, -- 报告开始日期
    report_end_date DATE, -- 报告结束日期
    
    -- 广告素材字段
    ad_link TEXT, -- 链接（广告设置）
    landing_url TEXT, -- 网址
    image_name TEXT, -- 图片名称
    video_name TEXT, -- 视频名称
    
    -- 转化价值字段
    conversion_value DECIMAL(15,2) DEFAULT 0, -- 转化价值
    
    -- 系统字段
    inserted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 唯一约束：同一站点、同一天、同一广告系列、同一广告组、同一广告不能重复
    CONSTRAINT unique_facebook_ads_record UNIQUE (site, day, campaign_name, adset_name, ad_name)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_facebook_ads_site_day ON public.independent_facebook_ads_daily (site, day);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_campaign ON public.independent_facebook_ads_daily (site, campaign_name);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_adset ON public.independent_facebook_ads_daily (site, adset_name);
CREATE INDEX IF NOT EXISTS idx_facebook_ads_date_range ON public.independent_facebook_ads_daily (day);

-- 添加注释
COMMENT ON TABLE public.independent_facebook_ads_daily IS 'Facebook Ads每日数据表 - 包含完整的Facebook Ads报告字段';
COMMENT ON COLUMN public.independent_facebook_ads_daily.site IS '站点标识';
COMMENT ON COLUMN public.independent_facebook_ads_daily.day IS '数据日期';
COMMENT ON COLUMN public.independent_facebook_ads_daily.campaign_name IS '广告系列名称';
COMMENT ON COLUMN public.independent_facebook_ads_daily.adset_name IS '广告组名称';
COMMENT ON COLUMN public.independent_facebook_ads_daily.ad_name IS '广告名称';
COMMENT ON COLUMN public.independent_facebook_ads_daily.delivery_status IS '投放状态';
COMMENT ON COLUMN public.independent_facebook_ads_daily.delivery_level IS '投放层级';
COMMENT ON COLUMN public.independent_facebook_ads_daily.impressions IS '展示次数';
COMMENT ON COLUMN public.independent_facebook_ads_daily.reach IS '覆盖人数';
COMMENT ON COLUMN public.independent_facebook_ads_daily.frequency IS '频次';
COMMENT ON COLUMN public.independent_facebook_ads_daily.clicks IS '点击量（全部）';
COMMENT ON COLUMN public.independent_facebook_ads_daily.link_clicks IS '链接点击量';
COMMENT ON COLUMN public.independent_facebook_ads_daily.spend_usd IS '已花费金额 (USD)';
COMMENT ON COLUMN public.independent_facebook_ads_daily.results IS '成效';
COMMENT ON COLUMN public.independent_facebook_ads_daily.atc_total IS '加入购物车';
COMMENT ON COLUMN public.independent_facebook_ads_daily.ic_total IS '结账发起次数';
COMMENT ON COLUMN public.independent_facebook_ads_daily.purchases IS '购物次数';
