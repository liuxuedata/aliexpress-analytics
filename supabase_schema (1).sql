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

CREATE TABLE IF NOT EXISTS public.ozon_daily_product_metrics (
  id bigserial primary key,
  tovary text,
  kategoriya_1_urovnya text,
  kategoriya_2_urovnya text,
  kategoriya_3_urovnya text,
  brend text,
  model text,
  shema_prodazh text,
  sku text,
  artikul text,
  prodazhi_abc_analiz_po_summe_zakazov text,
  prodazhi_abc_analiz_po_kolichestvu_zakazov text,
  prodazhi_zakazano_na_summu numeric,
  prodazhi_dinamika numeric,
  prodazhi_dolya_v_obschey_summe_zakazov numeric,
  prodazhi_dinamika_2 numeric,
  voronka_prodazh_pozitsiya_v_poiske_i_kataloge numeric,
  voronka_prodazh_dinamika numeric,
  voronka_prodazh_pokazy_vsego numeric,
  voronka_prodazh_dinamika_2 numeric,
  voronka_prodazh_konversiya_iz_pokaza_v_zakaz numeric,
  voronka_prodazh_dinamika_3 numeric,
  voronka_prodazh_pokazy_v_poiske_i_kataloge numeric,
  voronka_prodazh_dinamika_4 numeric,
  voronka_prodazh_konversiya_iz_poiska_i_kataloga_v_korzinu numeric,
  voronka_prodazh_dinamika_5 numeric,
  voronka_prodazh_dobavleniya_iz_poiska_i_kataloga_v_korzinu numeric,
  voronka_prodazh_dinamika_6 numeric,
  voronka_prodazh_konversiya_iz_poiska_i_kataloga_v_kartochku numeric,
  voronka_prodazh_dinamika_7 numeric,
  voronka_prodazh_posescheniya_kartochki_tovara numeric,
  voronka_prodazh_dinamika_8 numeric,
  voronka_prodazh_konversiya_iz_kartochki_v_korzinu numeric,
  voronka_prodazh_dinamika_9 numeric,
  voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu numeric,
  voronka_prodazh_dinamika_10 numeric,
  voronka_prodazh_konversiya_v_korzinu_obschaya numeric,
  voronka_prodazh_dinamika_11 numeric,
  voronka_prodazh_dobavleniya_v_korzinu_vsego numeric,
  voronka_prodazh_dinamika_12 numeric,
  voronka_prodazh_konversiya_iz_korziny_v_zakaz numeric,
  voronka_prodazh_dinamika_13 numeric,
  voronka_prodazh_zakazano_tovarov numeric,
  voronka_prodazh_dinamika_14 numeric,
  voronka_prodazh_dostavleno_tovarov numeric,
  voronka_prodazh_dinamika_15 numeric,
  voronka_prodazh_konversiya_iz_zakaza_v_vykup numeric,
  voronka_prodazh_dinamika_16 numeric,
  voronka_prodazh_vykupleno_tovarov numeric,
  voronka_prodazh_dinamika_17 numeric,
  voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_ numeric,
  voronka_prodazh_dinamika_18 numeric,
  voronka_prodazh_otmeneno_tovarov_na_datu_zakaza_ numeric,
  voronka_prodazh_dinamika_19 numeric,
  voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_ numeric,
  voronka_prodazh_dinamika_20 numeric,
  voronka_prodazh_vozvrascheno_tovarov_na_datu_zakaza_ numeric,
  voronka_prodazh_dinamika_21 numeric,
  faktory_prodazh_srednyaya_tsena numeric,
  faktory_prodazh_dinamika numeric,
  faktory_prodazh_skidka_ot_vashey_tseny numeric,
  faktory_prodazh_dinamika_2 numeric,
  faktory_prodazh_indeks_tsen text,
  faktory_prodazh_dney_v_aktsiyah text,
  faktory_prodazh_obschaya_drr numeric,
  faktory_prodazh_dinamika_3 numeric,
  faktory_prodazh_dney_s_prodvizheniem_trafarety_ text,
  faktory_prodazh_dney_bez_ostatka_19_07_2025_15_08_2025 text,
  faktory_prodazh_ostatok_na_konets_perioda numeric,
  faktory_prodazh_rekomendatsiya_po_postavke_na_fbo text,
  faktory_prodazh_skolko_tovarov_postavit text,
  faktory_prodazh_srednee_vremya_dostavki_19_07_2025_15_08_2025 text,
  faktory_prodazh_otzyvy numeric,
  faktory_prodazh_reyting_tovara numeric,
  inserted_at timestamptz default now()
);
