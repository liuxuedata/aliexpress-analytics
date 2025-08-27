-- Schema and migrations for Meta/Facebook ads reporting
create table if not exists public.core_site (
  site_id     text primary key,
  domain      text not null,
  brand_name  text,
  created_at  timestamptz default now()
);

create table if not exists public.core_channel (
  channel_id   text primary key,
  display_name text not null
);

create table if not exists public.core_datasource (
  datasource_id uuid primary key default gen_random_uuid(),
  site_id       text references public.core_site(site_id) on delete cascade,
  channel_id    text references public.core_channel(channel_id),
  name          text,
  mapping_json  jsonb,
  currency_code text,
  timezone      text,
  created_at    timestamptz default now()
);

insert into public.core_site(site_id, domain, brand_name)
values ('icyberite', 'icyberite.com', 'ICYBERITE')
on conflict (site_id) do nothing;

insert into public.core_channel(channel_id, display_name)
values ('meta_ads', 'Meta/Facebook Ads')
on conflict (channel_id) do nothing;

insert into public.core_datasource(site_id, channel_id, name)
values ('icyberite', 'meta_ads', 'Meta Export v1')
on conflict do nothing;

create table if not exists public.fb_raw (
  raw_id       bigint generated always as identity primary key,
  site_id      text references public.core_site(site_id),
  channel_id   text references public.core_channel(channel_id),
  datasource_id uuid references public.core_datasource(datasource_id),
  batch_id     uuid not null default gen_random_uuid(),
  row_data     jsonb not null,
  inserted_at  timestamptz default now()
);

create table if not exists public.meta_campaign (
  campaign_id   text primary key,
  site_id       text references public.core_site(site_id),
  campaign_name text
);

create table if not exists public.meta_adset (
  adset_id      text primary key,
  site_id       text references public.core_site(site_id),
  campaign_id   text references public.meta_campaign(campaign_id) on delete cascade,
  adset_name    text
);

create table if not exists public.meta_ad (
  ad_id     text primary key,
  site_id   text references public.core_site(site_id),
  adset_id  text references public.meta_adset(adset_id) on delete cascade,
  ad_name   text
);

create table if not exists public.fact_meta_daily (
  site_id        text references public.core_site(site_id),
  channel_id     text references public.core_channel(channel_id),
  level          text,
  campaign_id    text references public.meta_campaign(campaign_id),
  adset_id       text references public.meta_adset(adset_id),
  ad_id          text references public.meta_ad(ad_id),
  report_date    date not null,
  currency_code  text,
  spend_usd      numeric,
  reach          numeric,
  impressions    numeric,
  frequency      numeric,
  link_clicks    numeric,
  all_clicks     numeric,
  link_ctr       numeric,
  all_ctr        numeric,
  cpc_link       numeric,
  cpm            numeric,
  atc_total      numeric,
  atc_web        numeric,
  atc_meta       numeric,
  ic_total       numeric,
  ic_web         numeric,
  ic_meta        numeric,
  purchase_web   numeric,
  purchase_meta  numeric,
  product_identifier text,
  product_title_guess text,
  landing_url    text,
  creative_name  text,
  inserted_at    timestamptz default now(),
  primary key (site_id, channel_id, report_date, level, campaign_id, adset_id, ad_id)
);

create index if not exists idx_fact_meta_daily_site_date
  on public.fact_meta_daily(site_id, report_date);

create table if not exists public.product_map (
  product_id text primary key,
  site_id    text references public.core_site(site_id),
  sku        text,
  title      text,
  url        text
);

create or replace view public.mv_meta_weekly as
select
  site_id,
  date_trunc('week', report_date) as week_start,
  date_trunc('week', report_date) + interval '6 day' as week_end,
  level,
  campaign_id,
  adset_id,
  ad_id,
  sum(spend_usd)       as spend,
  sum(impressions)     as impressions,
  sum(link_clicks)     as link_clicks,
  sum(atc_web)         as atc_web,
  sum(ic_web)          as ic_web,
  sum(purchase_web)    as purchase_web,
  case when sum(impressions) > 0
       then sum(spend_usd)/sum(impressions)*1000 end as cpm,
  case when sum(link_clicks) > 0
       then sum(spend_usd)/sum(link_clicks) end      as cpc_link
from public.fact_meta_daily
group by site_id, week_start, week_end, level, campaign_id, adset_id, ad_id;

create or replace view public.mv_meta_product as
select
  f.site_id,
  f.report_date,
  pm.product_id,
  pm.sku,
  pm.title,
  pm.url,
  sum(f.spend_usd)     as spend,
  sum(f.link_clicks)   as link_clicks,
  sum(f.atc_web)       as atc_web,
  sum(f.ic_web)        as ic_web,
  sum(f.purchase_web)  as purchase_web
from public.fact_meta_daily f
left join public.product_map pm
       on f.site_id = pm.site_id
      and f.product_identifier = pm.product_id
group by f.site_id, f.report_date, pm.product_id, pm.sku, pm.title, pm.url;

create or replace function public.refresh_meta_schema_cache()
returns void
language plpgsql
security definer
as $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

select public.refresh_meta_schema_cache();
