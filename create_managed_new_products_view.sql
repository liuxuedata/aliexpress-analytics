-- 创建 managed_new_products 视图
-- 该视图用于计算速卖通全托管平台每个产品的首次出现日期

-- 删除现有视图（如果存在）
DROP VIEW IF EXISTS public.managed_new_products;

-- 创建新视图
CREATE OR REPLACE VIEW public.managed_new_products AS
SELECT 
    product_id,
    MIN(period_end) as first_seen
FROM public.managed_stats
WHERE search_exposure > 0 OR uv > 0  -- 只包含有曝光或访客的产品
GROUP BY product_id
ORDER BY first_seen;

-- 验证视图创建
SELECT 'managed_new_products view created successfully' as status;
SELECT COUNT(*) as total_records FROM public.managed_new_products;
