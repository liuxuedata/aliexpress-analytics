-- 安全迁移脚本：为速卖通自运营表添加站点字段
-- 这个脚本会检查现有表结构，然后安全地添加站点字段

-- 1. 检查表是否存在
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily') THEN
        RAISE EXCEPTION 'Table ae_self_operated_daily does not exist. Please run the full schema first.';
    END IF;
END $$;

-- 2. 检查是否已经有site字段
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily' AND column_name = 'site') THEN
        RAISE NOTICE 'Site column already exists, skipping migration';
        RETURN;
    END IF;
END $$;

-- 3. 备份现有数据（如果表有数据）
CREATE TABLE IF NOT EXISTS ae_self_operated_daily_backup AS 
SELECT * FROM ae_self_operated_daily;

-- 4. 添加site字段到现有表
ALTER TABLE public.ae_self_operated_daily 
ADD COLUMN site text NOT NULL DEFAULT 'A站';

-- 5. 更新主键约束
-- 先删除现有主键
ALTER TABLE public.ae_self_operated_daily 
DROP CONSTRAINT IF EXISTS ae_self_operated_daily_pkey;

-- 添加新的主键（包含site字段）
ALTER TABLE public.ae_self_operated_daily 
ADD CONSTRAINT ae_self_operated_daily_pkey 
PRIMARY KEY (site, product_id, stat_date);

-- 6. 创建site字段的索引
CREATE INDEX IF NOT EXISTS idx_ae_self_operated_daily_site 
ON public.ae_self_operated_daily(site);

-- 7. 更新视图（如果存在）
DROP VIEW IF EXISTS public.v_ae_self_operated_weekly;
CREATE OR REPLACE VIEW public.v_ae_self_operated_weekly AS
SELECT
  site,
  product_id,
  date_trunc('week', stat_date)::date as bucket,
  sum(exposure)   as exposure,
  sum(visitors)   as visitors,
  sum(views)      as views,
  sum(add_people) as add_people,
  sum(add_count)  as add_count,
  sum(pay_items)  as pay_items,
  sum(pay_orders) as pay_orders,
  sum(pay_buyers) as pay_buyers
FROM public.ae_self_operated_daily
GROUP BY 1,2,3;

DROP VIEW IF EXISTS public.v_ae_self_operated_monthly;
CREATE OR REPLACE VIEW public.v_ae_self_operated_monthly AS
SELECT
  site,
  product_id,
  date_trunc('month', stat_date)::date as bucket,
  sum(exposure)   as exposure,
  sum(visitors)   as visitors,
  sum(views)      as views,
  sum(add_people) as add_people,
  sum(add_count)  as add_count,
  sum(pay_items)  as pay_items,
  sum(pay_orders) as pay_orders,
  sum(pay_buyers) as pay_buyers
FROM public.ae_self_operated_daily
GROUP BY 1,2,3;

-- 8. 创建站点管理表（如果不存在）
CREATE TABLE IF NOT EXISTS public.sites (
  id          text primary key,
  name        text not null,
  platform    text not null,
  display_name text not null,
  is_active   boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 9. 初始化默认站点
INSERT INTO public.sites (id, name, platform, display_name) VALUES
  ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
  ('independent_poolsvacuum', 'poolsvacuum', 'independent', '独立站 poolsvacuum.com')
ON CONFLICT (id) DO NOTHING;

-- 10. 设置RLS策略
ALTER TABLE public.ae_self_operated_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- 清理旧策略
DROP POLICY IF EXISTS p_ins_all ON public.ae_self_operated_daily;
DROP POLICY IF EXISTS p_upd_all ON public.ae_self_operated_daily;
DROP POLICY IF EXISTS p_sel_all ON public.ae_self_operated_daily;

-- 创建新策略
CREATE POLICY p_sel_all ON public.ae_self_operated_daily
FOR SELECT TO anon USING (true);

CREATE POLICY p_ins_all ON public.ae_self_operated_daily
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY p_upd_all ON public.ae_self_operated_daily
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 站点表策略
DROP POLICY IF EXISTS p_sites_sel_all ON public.sites;
DROP POLICY IF EXISTS p_sites_ins_all ON public.sites;
DROP POLICY IF EXISTS p_sites_upd_all ON public.sites;

CREATE POLICY p_sites_sel_all ON public.sites
FOR SELECT TO anon USING (true);

CREATE POLICY p_sites_ins_all ON public.sites
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY p_sites_upd_all ON public.sites
FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 11. 验证迁移结果
SELECT 'Migration completed successfully' as status;
SELECT COUNT(*) as total_records FROM ae_self_operated_daily;
SELECT COUNT(*) as total_sites FROM sites;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily' 
AND column_name = 'site';

-- 12. 清理备份表（可选，建议保留一段时间）
-- DROP TABLE ae_self_operated_daily_backup;
