drop table if exists public.ozon_product_report_wide;

create table public.ozon_product_report_wide (
  sku text not null,
  den date not null,
  inserted_at timestamptz not null default now(),
  tovary text null,
  kategoriya_1_urovnya text null,
  kategoriya_2_urovnya text null,
  kategoriya_3_urovnya text null,
  brend text null,
  model text null,
  shema_prodazh text null,
  artikul text null,
  prodazhi_abc_analiz_po_summe_zakazov text null,
  prodazhi_abc_analiz_po_kolichestvu_zakazov text null,
  prodazhi_zakazano_na_summu numeric null,
  prodazhi_dinamika numeric null,
  prodazhi_dolya_v_obschey_summe_zakazov numeric null,
  prodazhi_dinamika_2 numeric null,
  voronka_prodazh_pozitsiya_v_poiske_i_kataloge numeric null,
  voronka_prodazh_dinamika numeric null,
  voronka_prodazh_pokazy_vsego numeric null,
  voronka_prodazh_unikalnye_posetiteli_vsego numeric null,
  voronka_prodazh_dinamika_2 numeric null,
  voronka_prodazh_konversiya_iz_pokaza_v_zakaz numeric null,
  voronka_prodazh_dinamika_3 numeric null,
  voronka_prodazh_pokazy_v_poiske_i_kataloge numeric null,
  voronka_prodazh_uv_s_prosmotrom_v_poiske_ili_kataloge numeric null,
  voronka_prodazh_dinamika_4 numeric null,
  voronka_prodazh_konversiya_iz_poiska_i_kataloga_v_korzinu numeric null,
  voronka_prodazh_dinamika_5 numeric null,
  voronka_prodazh_dobavleniya_iz_poiska_i_kataloga_v_korzinu numeric null,
  voronka_prodazh_dinamika_6 numeric null,
  voronka_prodazh_konversiya_iz_poiska_i_kataloga_v_kartochku numeric null,
  voronka_prodazh_dinamika_7 numeric null,
  voronka_prodazh_posescheniya_kartochki_tovara numeric null,
  voronka_prodazh_uv_s_prosmotrom_kartochki_tovara numeric null,
  voronka_prodazh_dinamika_8 numeric null,
  voronka_prodazh_konversiya_iz_kartochki_v_korzinu numeric null,
  voronka_prodazh_dinamika_9 numeric null,
  voronka_prodazh_dobavleniya_iz_kartochki_v_korzinu numeric null,
  voronka_prodazh_dinamika_10 numeric null,
  voronka_prodazh_konversiya_v_korzinu_obschaya numeric null,
  voronka_prodazh_dinamika_11 numeric null,
  voronka_prodazh_dobavleniya_v_korzinu_vsego numeric null,
  voronka_prodazh_dinamika_12 numeric null,
  voronka_prodazh_konversiya_iz_korziny_v_zakaz numeric null,
  voronka_prodazh_dinamika_13 numeric null,
  voronka_prodazh_zakazano_tovarov numeric null,
  voronka_prodazh_dinamika_14 numeric null,
  voronka_prodazh_dostavleno_tovarov numeric null,
  voronka_prodazh_dinamika_15 numeric null,
  voronka_prodazh_konversiya_iz_zakaza_v_vykup numeric null,
  voronka_prodazh_dinamika_16 numeric null,
  voronka_prodazh_vykupleno_tovarov numeric null,
  voronka_prodazh_dinamika_17 numeric null,
  voronka_prodazh_otmeneno_tovarov_na_datu_otmeny_ numeric null,
  voronka_prodazh_dinamika_18 numeric null,
  voronka_prodazh_otmeneno_tovarov_na_datu_zakaza_ numeric null,
  voronka_prodazh_dinamika_19 numeric null,
  voronka_prodazh_vozvrascheno_tovarov_na_datu_vozvrata_ numeric null,
  voronka_prodazh_dinamika_20 numeric null,
  voronka_prodazh_vozvrascheno_tovarov_na_datu_zakaza_ numeric null,
  voronka_prodazh_dinamika_21 numeric null,
  faktory_prodazh_srednyaya_tsena numeric null,
  faktory_prodazh_dinamika numeric null,
  faktory_prodazh_skidka_ot_vashey_tseny numeric null,
  faktory_prodazh_dinamika_2 numeric null,
  faktory_prodazh_indeks_tsen text null,
  faktory_prodazh_dney_v_aktsiyah text null,
  faktory_prodazh_obschaya_drr numeric null,
  faktory_prodazh_dinamika_3 numeric null,
  faktory_prodazh_dney_s_prodvizheniem_trafarety_ text null,
  faktory_prodazh_dney_bez_ostatka numeric null,
  faktory_prodazh_ostatok_na_konets_perioda numeric null,
  faktory_prodazh_rekomendatsiya_po_postavke_na_fbo text null,
  faktory_prodazh_skolko_tovarov_postavit numeric null,
  faktory_prodazh_srednee_vremya_dostavki numeric null,
  faktory_prodazh_otzyvy numeric null,
  faktory_prodazh_reyting_tovara numeric null,
  primary key (sku, den)
);

create or replace function public.refresh_ozon_schema_cache()
returns void
language plpgsql
security definer
as $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

create or replace function public.get_public_columns(table_name text)
returns table(column_name text)
language sql
stable
security definer
as $$
  select column_name
  from information_schema.columns
  where table_schema = 'public' and table_name = $1;
$$;

select public.refresh_ozon_schema_cache();
