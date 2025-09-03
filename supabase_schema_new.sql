git commit --allow-empty -m "trigger vercel preview for <your-branch>"
git push origin <your-branch>
-- Supabase: 速卖通自运营日度表（主键：site + product_id + stat_date）
-- 适用于全新环境部署

create table if not exists public.ae_self_operated_daily (
  site        text not null default 'A站',  -- 站点标识字段
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

-- 更新触发器：自动刷新 updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_set_updated_at on public.ae_self_operated_daily;
create trigger trg_set_updated_at before update on public.ae_self_operated_daily
for each row execute function public.set_updated_at();

-- 索引
create index if not exists idx_ae_self_operated_daily_stat_date on public.ae_self_operated_daily(stat_date);
create index if not exists idx_ae_self_operated_daily_product on public.ae_self_operated_daily(product_id);
create index if not exists idx_ae_self_operated_daily_site on public.ae_self_operated_daily(site);

-- 视图（可选）
create or replace view public.v_ae_self_operated_weekly as
select
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
from public.ae_self_operated_daily
group by 1,2,3;

create or replace view public.v_ae_self_operated_monthly as
select
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
from public.ae_self_operated_daily
group by 1,2,3;

-- 站点管理表
create table if not exists public.sites (
  id          text primary key,
  name        text not null,
  platform    text not null,  -- 'ae_self_operated', 'independent', 'ae_managed'
  display_name text not null,
  is_active   boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 初始化默认站点
insert into public.sites (id, name, platform, display_name) values
  ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
  ('independent_poolsvacuum', 'poolsvacuum.com', 'independent', '独立站 poolsvacuum.com')
on conflict (id) do nothing;

-- RLS
alter table public.ae_self_operated_daily enable row level security;
alter table public.sites enable row level security;

-- 先清理旧策略
drop policy if exists p_ins_all on public.ae_self_operated_daily;
drop policy if exists p_upd_all on public.ae_self_operated_daily;
drop policy if exists p_sel_all on public.ae_self_operated_daily;

-- 开发期（演示用）策略
create policy p_sel_all on public.ae_self_operated_daily
for select
to anon
using (true);

create policy p_ins_all on public.ae_self_operated_daily
for insert
to anon
with check (true);

create policy p_upd_all on public.ae_self_operated_daily
for update
to anon
using (true)
with check (true);

-- 站点表策略
create policy p_sites_sel_all on public.sites
for select
to anon
using (true);

create policy p_sites_ins_all on public.sites
for insert
to anon
with check (true);

create policy p_sites_upd_all on public.sites
for update
to anon
using (true)
with check (true);
