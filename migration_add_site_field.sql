-- 数据库迁移脚本：为速卖通自运营表添加站点字段
-- 执行前请备份数据库

-- 1. 备份现有数据
CREATE TABLE IF NOT EXISTS ae_self_operated_daily_backup AS 
SELECT * FROM ae_self_operated_daily;

-- 2. 删除现有表（如果存在）
DROP TABLE IF EXISTS ae_self_operated_daily CASCADE;

-- 3. 重新创建表结构（包含站点字段）
CREATE TABLE public.ae_self_operated_daily (
  site        text not null default 'A站',
  product_id  text not null,
  stat_date   date not null,
  exposure    numeric default 0,
  visitors    numeric default 0,
  views       numeric default 0,
  add_people  numeric default 0,
  add_count   numeric default 0,
  pay_items   numeric default 0,
  pay_orders  numeric default 0,
  pay_buyers  numeric default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (site, product_id, stat_date)
);

-- 4. 恢复数据（为所有现有记录设置默认站点为'A站'）
INSERT INTO ae_self_operated_daily (
  site, product_id, stat_date, exposure, visitors, views, 
  add_people, add_count, pay_items, pay_orders, pay_buyers, 
  created_at, updated_at
)
SELECT 
  'A站' as site,
  product_id, stat_date, exposure, visitors, views,
  add_people, add_count, pay_items, pay_orders, pay_buyers,
  created_at, updated_at
FROM ae_self_operated_daily_backup;

-- 5. 重新创建索引
CREATE INDEX idx_ae_self_operated_daily_stat_date ON public.ae_self_operated_daily(stat_date);
CREATE INDEX idx_ae_self_operated_daily_product ON public.ae_self_operated_daily(product_id);
CREATE INDEX idx_ae_self_operated_daily_site ON public.ae_self_operated_daily(site);

-- 6. 重新创建触发器
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger language plpgsql AS $$
BEGIN 
  new.updated_at = now(); 
  return new; 
END; $$;

CREATE TRIGGER trg_set_updated_at 
  BEFORE UPDATE ON public.ae_self_operated_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. 重新创建视图
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

-- 8. 创建站点管理表
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
  ('independent_poolsvacuum', 'poolsvacuum.com', 'independent', '独立站 poolsvacuum.com')
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

-- 12. 清理备份表（可选，建议保留一段时间）
-- DROP TABLE ae_self_operated_daily_backup;
