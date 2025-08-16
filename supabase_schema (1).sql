-- Supabase: 速卖通自运营日度表（主键：product_id + stat_date）
create table if not exists public.ae_self_operated_daily (
  product_id text not null,
  stat_date  date not null,
  exposure   numeric default 0,
  visitors   numeric default 0,
  views      numeric default 0,
  add_people numeric default 0,
  add_count  numeric default 0,
  pay_items  numeric default 0,
  pay_orders numeric default 0,
  pay_buyers numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, stat_date)
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

-- 视图（可选）
create or replace view public.v_ae_self_operated_weekly as
select
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
group by 1,2;

create or replace view public.v_ae_self_operated_monthly as
select
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
group by 1,2;

-- RLS
alter table public.ae_self_operated_daily enable row level security;

-- 先清理旧策略
drop policy if exists p_ins_all on public.ae_self_operated_daily;
drop policy if exists p_upd_all on public.ae_self_operated_daily;
drop policy if exists p_sel_all on public.ae_self_operated_daily;

-- 开发期（演示用）策略 —— 注意：INSERT 只能写 WITH CHECK，不能写 USING
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

/*
生产环境建议：
-- 1) 删除 anon 的写策略，保留只读：
drop policy if exists p_ins_all on public.ae_self_operated_daily;
drop policy if exists p_upd_all on public.ae_self_operated_daily;
-- 2) 如需 authenticated 可读：将上面的 'to anon' 改为 'to authenticated' 或同时保留两者。
-- 3) 所有写入仅经由 Vercel Serverless（service role）完成，RLS 会被绕过（admin）。
*/

-- Ozon 日度产品指标表
create table if not exists public.ozon_daily_product_metrics (
  id bigserial primary key,
  store_id text not null,
  day date not null,
  product_id text not null,
  product_title text,
  category_name text,
  search_exposure bigint,
  uv bigint,
  pv bigint,
  add_to_cart_users bigint,
  add_to_cart_qty bigint,
  pay_items bigint,
  pay_orders bigint,
  pay_buyers bigint,
  inserted_at timestamptz default now(),
  unique (store_id, day, product_id)
);
create index if not exists idx_ozon_dpm_store_day on public.ozon_daily_product_metrics (store_id, day);
create index if not exists idx_ozon_dpm_store_prod on public.ozon_daily_product_metrics (store_id, product_id);

create table if not exists public.ozon_first_seen (
  store_id text not null,
  product_id text not null,
  first_seen_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);

create table if not exists public.ozon_order_items (
  order_id text not null,
  store_id text not null,
  product_id text not null,
  day date not null,
  quantity numeric default 0,
  price numeric default 0,
  revenue numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
