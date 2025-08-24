-- Schema for Facebook-based analytics
-- Derived from design proposal for icyberite.com

-- Core site and channel metadata
create table if not exists core_site (
  site_id       text primary key,
  domain        text not null,
  brand_name    text,
  created_at    timestamptz default now()
);

create table if not exists core_channel (
  channel_id    text primary key,
  display_name  text not null
);

create table if not exists core_datasource (
  datasource_id   uuid primary key default gen_random_uuid(),
  site_id         text references core_site(site_id) on delete cascade,
  channel_id      text references core_channel(channel_id),
  name            text,
  currency        text default 'USD',
  timezone        text default 'UTC',
  mapping_json    jsonb not null,
  created_at      timestamptz default now()
);

-- Ingestion batch records
create table if not exists core_ingestion_batch (
  batch_id      uuid primary key default gen_random_uuid(),
  site_id       text references core_site(site_id),
  channel_id    text references core_channel(channel_id),
  datasource_id uuid references core_datasource(datasource_id),
  file_name     text,
  file_hash     text,
  report_start  date,
  report_end    date,
  row_count     int,
  created_at    timestamptz default now(),
  unique(file_hash)
);

-- Advertising entity dimensions
create table if not exists meta_campaign (
  campaign_id    text primary key,
  site_id        text references core_site(site_id),
  campaign_name  text,
  objective      text,
  status         text,
  created_at     timestamptz default now()
);

create table if not exists meta_adset (
  adset_id     text primary key,
  site_id      text references core_site(site_id),
  campaign_id  text references meta_campaign(campaign_id) on delete cascade,
  adset_name   text,
  status       text,
  created_at   timestamptz default now()
);

create table if not exists meta_ad (
  ad_id       text primary key,
  site_id     text references core_site(site_id),
  adset_id    text references meta_adset(adset_id) on delete cascade,
  ad_name     text,
  creative_name text,
  landing_url text,
  status      text,
  created_at  timestamptz default now()
);

-- Product dimension and mapping
create table if not exists dim_product (
  product_id    text primary key,
  site_id       text references core_site(site_id),
  product_title text,
  product_url   text,
  created_at    timestamptz default now()
);

create table if not exists map_product_meta (
  map_id        uuid primary key default gen_random_uuid(),
  site_id       text references core_site(site_id),
  raw_identifier text not null,
  product_id    text references dim_product(product_id),
  confidence    int default 100,
  unique(site_id, raw_identifier)
);

-- Fact table at daily grain
create table if not exists fact_meta_daily (
  site_id       text references core_site(site_id),
  date          date not null,
  level         text,
  campaign_id   text,
  adset_id      text,
  ad_id         text,
  product_id    text,
  reach         bigint default 0,
  impressions   bigint default 0,
  frequency     numeric(10,4),
  all_clicks    bigint default 0,
  link_clicks   bigint default 0,
  ctr_all       numeric(10,6),
  ctr_link      numeric(10,6),
  spend_usd     numeric(18,6) default 0,
  cpm           numeric(18,6),
  cpc_all       numeric(18,6),
  cpc_link      numeric(18,6),
  atc_total     int default 0,
  atc_web       int default 0,
  atc_meta      int default 0,
  ic_total      int default 0,
  ic_web        int default 0,
  ic_meta       int default 0,
  purchase_web  int default 0,
  purchase_meta int default 0,
  batch_id      uuid references core_ingestion_batch(batch_id),
  primary key (site_id, date, level, campaign_id, adset_id, ad_id, product_id)
);

create index if not exists idx_fact_meta_daily_site_date on fact_meta_daily(site_id, date);
create index if not exists idx_fact_meta_daily_rollup on fact_meta_daily(site_id, level, campaign_id, adset_id);

-- Weekly materialized view
create materialized view if not exists mv_meta_weekly as
select
  site_id,
  date_trunc('week', date)::date as week_start,
  max(date) as week_end,
  level, campaign_id, adset_id, ad_id, product_id,
  sum(reach) as reach,
  sum(impressions) as impressions,
  sum(spend_usd) as spend_usd,
  sum(all_clicks) as all_clicks,
  sum(link_clicks) as link_clicks,
  sum(atc_web) as atc_web,
  sum(ic_web) as ic_web,
  sum(purchase_web) as purchase_web,
  (case when sum(impressions)>0 then sum(spend_usd)/sum(impressions)*1000 end) as cpm,
  (case when sum(link_clicks)>0 then sum(spend_usd)/sum(link_clicks) end) as cpc_link
from fact_meta_daily
group by 1,2,4,5,6,7,8;

create index if not exists idx_mv_meta_weekly on mv_meta_weekly(site_id, week_start);
