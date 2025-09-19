-- 为 order_items 表补充 product_image 字段
-- 解决 Ozon 订单同步写入包含商品主图时的列缺失问题

ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS product_image TEXT;

COMMENT ON COLUMN public.order_items.product_image IS '商品主图 URL（可为空，兼容未返回图片的平台）';

-- 验证字段存在性
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name = 'product_image';
