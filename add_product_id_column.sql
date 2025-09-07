-- 为现有的 independent_facebook_ads_daily 表添加 product_id 字段
-- 如果字段已存在，则忽略错误

-- 添加 product_id 字段
ALTER TABLE public.independent_facebook_ads_daily 
ADD COLUMN IF NOT EXISTS product_id TEXT;

-- 添加字段注释
COMMENT ON COLUMN public.independent_facebook_ads_daily.product_id IS '商品编号';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_facebook_ads_product_id ON public.independent_facebook_ads_daily (site, product_id);

-- 显示表结构确认
\d public.independent_facebook_ads_daily;
