-- independent_landing_pages.sql
-- Schema for storing Google Ads Landing Pages performance for Independent Sites.
-- Run this in Supabase SQL editor (or psql).

create table if not exists public.independent_landing_metrics (
  id bigserial primary key,
  site text not null,                         -- domain, e.g. poolsvacuum.com
  landing_url text not null,
  landing_path text not null,
  campaign text,
  day date not null,
  network text,
  device text,
  clicks bigint default 0,
  impr bigint default 0,
  ctr numeric(10,6) default 0,                -- 0.1234 = 12.34%
  avg_cpc numeric(12,4) default 0,
  cost numeric(14,4) default 0,
  conversions numeric(14,4) default 0,
  cost_per_conv numeric(14,4) default 0,
  all_conv numeric(14,4) default 0,
  conv_value numeric(14,4) default 0,
  all_conv_rate numeric(10,6) default 0,
  conv_rate numeric(10,6) default 0,
  inserted_at timestamptz not null default now(),
  constraint independent_landing_metrics_uniq unique (day, site, landing_path, device, network, campaign)
);

-- Helpful indexes
create index if not exists idx_ind_lm_site_day on public.independent_landing_metrics (site, day);
create index if not exists idx_ind_lm_site_campaign_day on public.independent_landing_metrics (site, campaign, day);
create index if not exists idx_ind_lm_site_path on public.independent_landing_metrics (site, landing_path);

-- Optional: a daily summary view per site
create or replace view public.independent_landing_summary_by_day as
select
  site, day,
  sum(clicks)::bigint as clicks,
  sum(impr)::bigint as impr,
  case when sum(impr)>0 then round(sum(clicks)::numeric/sum(impr), 6) else 0 end as ctr,
  round(sum(cost), 4) as cost,
  round(sum(conversions), 4) as conversions,
  round(sum(conv_value), 4) as conv_value,
  case when sum(conversions)>0 then round(sum(cost)/sum(conversions), 4) else 0 end as cpa,
  case when sum(cost)>0 then round(sum(conv_value)/sum(cost), 4) else 0 end as roas
from public.independent_landing_metrics
group by site, day;

-- Row Level Security: adjust as you need (here we allow authenticated select/insert/upsert)
alter table public.independent_landing_metrics enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'independent_landing_metrics' and policyname = 'allow_read') then
    create policy allow_read on public.independent_landing_metrics for select using ( true );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'independent_landing_metrics' and policyname = 'allow_write') then
    create policy allow_write on public.independent_landing_metrics for insert with check ( true );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'independent_landing_metrics' and policyname = 'allow_upsert') then
    create policy allow_upsert on public.independent_landing_metrics for update using ( true );
  end if;
end $$;