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
  tovary text, -- Товары
  kategoriya_1_urovnya text, -- Категория 1 уровня
  kategoriya_2_urovnya text, -- Категория 2 уровня
  kategoriya_3_urovnya text, -- Категория 3 уровня
  brend text, -- Бренд
  model text, -- Модель
  shema_prodazh text, -- Схема продаж
  sku text, -- SKU
  artikul text, -- Артикул
  abc_analiz_po_summe_zakazov text, -- ABC-анализ по сумме заказов
  abc_analiz_po_kolichestvu_zakazov text, -- ABC-анализ по количеству заказов
  zakazano_na_summu numeric, -- Заказано на сумму
  dinamika numeric, -- Динамика
  dolya_v_obschei_summe_zakazov numeric, -- Доля в общей сумме заказов
  dinamika_2 numeric, -- Динамика
  pozitsiya_v_poiske_i_kataloge numeric, -- Позиция в поиске и каталоге
  dinamika_3 numeric, -- Динамика
  pokazy_vsego numeric, -- Показы всего
  dinamika_4 numeric, -- Динамика
  konversiya_iz_pokaza_v_zakaz numeric, -- Конверсия из показа в заказ
  dinamika_5 numeric, -- Динамика
  pokazy_v_poiske_i_kataloge numeric, -- Показы в поиске и каталоге
  dinamika_6 numeric, -- Динамика
  konversiya_iz_poiska_i_kataloga_v_korzinu numeric, -- Конверсия из поиска и каталога в корзину
  dinamika_7 numeric, -- Динамика
  dobavleniya_iz_poiska_i_kataloga_v_korzinu numeric, -- Добавления из поиска и каталога в корзину
  dinamika_8 numeric, -- Динамика
  konversiya_iz_poiska_i_kataloga_v_kartochku numeric, -- Конверсия из поиска и каталога в карточку
  dinamika_9 numeric, -- Динамика
  posescheniya_kartochki_tovara numeric, -- Посещения карточки товара
  dinamika_10 numeric, -- Динамика
  konversiya_iz_kartochki_v_korzinu numeric, -- Конверсия из карточки в корзину
  dinamika_11 numeric, -- Динамика
  dobavleniya_iz_kartochki_v_korzinu numeric, -- Добавления из карточки в корзину
  dinamika_12 numeric, -- Динамика
  konversiya_v_korzinu_obschaya numeric, -- Конверсия в корзину общая
  dinamika_13 numeric, -- Динамика
  dobavleniya_v_korzinu_vsego numeric, -- Добавления в корзину всего
  dinamika_14 numeric, -- Динамика
  konversiya_iz_korziny_v_zakaz numeric, -- Конверсия из корзины в заказ
  dinamika_15 numeric, -- Динамика
  zakazano_tovarov numeric, -- Заказано товаров
  dinamika_16 numeric, -- Динамика
  dostavleno_tovarov numeric, -- Доставлено товаров
  dinamika_17 numeric, -- Динамика
  konversiya_iz_zakaza_v_vykup numeric, -- Конверсия из заказа в выкуп
  dinamika_18 numeric, -- Динамика
  vykupleno_tovarov numeric, -- Выкуплено товаров
  dinamika_19 numeric, -- Динамика
  otmeneno_tovarov_na_datu_otmeny numeric, -- Отменено товаров (на дату отмены)
  dinamika_20 numeric, -- Динамика
  otmeneno_tovarov_na_datu_zakaza numeric, -- Отменено товаров (на дату заказа)
  dinamika_21 numeric, -- Динамика
  vozvrascheno_tovarov_na_datu_vozvrata numeric, -- Возвращено товаров (на дату возврата)
  dinamika_22 numeric, -- Динамика
  vozvrascheno_tovarov_na_datu_zakaza numeric, -- Возвращено товаров (на дату заказа)
  dinamika_23 numeric, -- Динамика
  srednyaya_tsena numeric, -- Средняя цена
  dinamika_24 numeric, -- Динамика
  skidka_ot_vashei_tseny numeric, -- Скидка от вашей цены
  dinamika_25 numeric, -- Динамика
  indeks_tsen numeric, -- Индекс цен
  dnei_v_aktsiyah numeric, -- Дней в акциях
  obschaya_drr numeric, -- Общая ДРР
  dinamika_26 numeric, -- Динамика
  dnei_s_prodvizheniem_trafarety numeric, -- Дней с продвижением (трафареты)
  dnei_bez_ostatka_19072025_15082025 numeric, -- Дней без остатка 19.07.2025 – 15.08.2025
  ostatok_na_konets_perioda numeric, -- Остаток на конец периода
  rekomendatsiya_po_postavke_na_fbo numeric, -- Рекомендация по поставке на FBO
  skolko_tovarov_postavit numeric, -- Сколько товаров поставить
  srednee_vremya_dostavki_19072025_15082025 numeric, -- Среднее время доставки 19.07.2025 – 15.08.2025
  otzyvy numeric, -- Отзывы
  reiting_tovara numeric, -- Рейтинг товара
  inserted_at timestamptz default now()
);
