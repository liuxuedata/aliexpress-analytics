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

-- Ozon 产品报表宽表
create table if not exists public.ozon_product_report_wide (
  id bigserial not null,
  store_id text not null,
  day date not null,
  product_id text not null,
  product_title text null,
  category_l1 text null,
  category_l2 text null,
  category_l3 text null,
  brand text null,
  model text null,
  sales_scheme text null,
  sku text null,
  article text null,
  abc_by_amount text null,
  abc_by_qty text null,
  amount_ordered numeric(18, 2) null,
  amount_ordered_delta numeric(18, 4) null,
  amount_share numeric(10, 6) null,
  amount_share_delta numeric(10, 6) null,
  search_position_avg numeric(10, 4) null,
  search_position_delta numeric(10, 4) null,
  impressions_total bigint null,
  impressions_total_delta numeric(18, 4) null,
  conv_impr_to_order numeric(10, 6) null,
  conv_impr_to_order_delta numeric(10, 6) null,
  impressions_search_catalog bigint null,
  impressions_search_catalog_delta numeric(18, 4) null,
  conv_sc_to_cart numeric(10, 6) null,
  conv_sc_to_cart_delta numeric(10, 6) null,
  add_to_cart_from_sc bigint null,
  add_to_cart_from_sc_delta numeric(18, 4) null,
  conv_sc_to_card numeric(10, 6) null,
  conv_sc_to_card_delta numeric(10, 6) null,
  product_card_visits bigint null,
  product_card_visits_delta numeric(18, 4) null,
  conv_card_to_cart numeric(10, 6) null,
  conv_card_to_cart_delta numeric(10, 6) null,
  add_to_cart_from_card bigint null,
  add_to_cart_from_card_delta numeric(18, 4) null,
  conv_overall_to_cart numeric(10, 6) null,
  conv_overall_to_cart_delta numeric(10, 6) null,
  add_to_cart_total bigint null,
  add_to_cart_total_delta numeric(18, 4) null,
  conv_cart_to_order numeric(10, 6) null,
  conv_cart_to_order_delta numeric(10, 6) null,
  items_ordered bigint null,
  items_ordered_delta numeric(18, 4) null,
  items_delivered bigint null,
  items_delivered_delta numeric(18, 4) null,
  conv_order_to_buyout numeric(10, 6) null,
  conv_order_to_buyout_delta numeric(10, 6) null,
  items_buyout bigint null,
  items_buyout_delta numeric(18, 4) null,
  items_cancel_by_cancel_date bigint null,
  items_cancel_by_cancel_date_delta numeric(18, 4) null,
  items_cancel_by_order_date bigint null,
  items_cancel_by_order_date_delta numeric(18, 4) null,
  items_return_by_return_date bigint null,
  items_return_by_return_date_delta numeric(18, 4) null,
  items_return_by_order_date bigint null,
  items_return_by_order_date_delta numeric(18, 4) null,
  avg_price numeric(14, 2) null,
  avg_price_delta numeric(14, 4) null,
  discount_from_your_price numeric(10, 6) null,
  discount_from_your_price_delta numeric(10, 6) null,
  price_index numeric(10, 6) null,
  promo_days integer null,
  ad_spend_ratio numeric(10, 6) null,
  ad_spend_ratio_delta numeric(10, 6) null,
  promoted_days integer null,
  oos_days_28d integer null,
  ending_stock bigint null,
  fbo_supply_advice text null,
  fbo_supply_qty integer null,
  avg_delivery_days numeric(10, 4) null,
  reviews_count integer null,
  product_rating numeric(10, 4) null,
  inserted_at timestamptz not null default now(),
  constraint ozon_product_report_wide_pkey primary key (id),
  constraint ozon_prw_uniq unique (store_id, day, product_id)
);
create table if not exists public.ozon_raw_analytics (
  id bigserial primary key,
  store_id text,
  raw_row jsonb not null,
  import_batch text,
  inserted_at timestamptz default now()
);
create index if not exists idx_ozon_prw_store_day on public.ozon_product_report_wide (store_id, day);
create index if not exists idx_ozon_prw_store_prod on public.ozon_product_report_wide (store_id, product_id);

create table if not exists public.ozon_metric_dictionary (
  std_field text primary key,
  ru_label text,
  ru_desc text,
  zh_desc text
);

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
