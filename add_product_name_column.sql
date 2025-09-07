-- 为 independent_facebook_ads_daily 表添加 product_name 字段
-- 用于存储商品名称，与 product_id 字段配合使用

-- 添加 product_name 字段
ALTER TABLE public.independent_facebook_ads_daily 
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 添加字段注释
COMMENT ON COLUMN public.independent_facebook_ads_daily.product_name IS '商品名称';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_facebook_ads_product_name ON public.independent_facebook_ads_daily (site, product_name);

-- 显示表结构确认
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'independent_facebook_ads_daily' 
AND column_name IN ('product_id', 'product_name')
ORDER BY ordinal_position;
