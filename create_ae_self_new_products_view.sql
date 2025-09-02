-- 创建 ae_self_new_products 视图
-- 该视图用于计算速卖通自运营平台每个产品在每个站点的首次出现日期

-- 删除现有视图（如果存在）
DROP VIEW IF EXISTS public.ae_self_new_products;

-- 创建新视图
CREATE OR REPLACE VIEW public.ae_self_new_products AS
SELECT 
    site,
    product_id,
    MIN(stat_date) as first_seen
FROM public.ae_self_operated_daily
WHERE exposure > 0 OR visitors > 0  -- 只包含有曝光或访客的产品
GROUP BY site, product_id
ORDER BY site, first_seen;

-- 验证视图创建
SELECT 'ae_self_new_products view created successfully' as status;
SELECT COUNT(*) as total_records FROM public.ae_self_new_products;
SELECT site, COUNT(*) as product_count FROM public.ae_self_new_products GROUP BY site ORDER BY site;
