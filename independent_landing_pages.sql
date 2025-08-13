-- Supabase: independent site landing pages metrics
create table if not exists public.independent_landing_metrics (
  site text not null,
  landing_url text not null,
  landing_path text not null,
  campaign text,
  day date not null,
  network text,
  device text,
  clicks numeric default 0,
  impr numeric default 0,
  ctr numeric default 0,
  avg_cpc numeric default 0,
  cost numeric default 0,
  conversions numeric default 0,
  cost_per_conv numeric default 0,
  all_conv numeric default 0,
  conv_value numeric default 0,
  all_conv_rate numeric default 0,
  conv_rate numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, site, landing_path, device, network, campaign)
);

-- trigger: auto update timestamp
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_independent_landing_metrics on public.independent_landing_metrics;
create trigger trg_independent_landing_metrics before update on public.independent_landing_metrics
for each row execute function public.set_updated_at();

-- indexes for common filters
create index if not exists idx_ind_landing_site_day on public.independent_landing_metrics(site, day);
create index if not exists idx_ind_landing_path on public.independent_landing_metrics(landing_path);

-- daily summary view
create or replace view public.independent_landing_summary_by_day as
select
  site,
  day,
  sum(clicks) as clicks,
  sum(impr) as impr,
  sum(conversions) as conversions,
  sum(conv_value) as conv_value,
  sum(cost) as cost
from public.independent_landing_metrics
group by site, day;

-- RLS policies (dev/demo; adjust for production)
alter table public.independent_landing_metrics enable row level security;

drop policy if exists p_sel_all on public.independent_landing_metrics;
drop policy if exists p_ins_all on public.independent_landing_metrics;
drop policy if exists p_upd_all on public.independent_landing_metrics;

create policy p_sel_all on public.independent_landing_metrics for select to anon using (true);
create policy p_ins_all on public.independent_landing_metrics for insert to anon with check (true);
create policy p_upd_all on public.independent_landing_metrics for update to anon using (true) with check (true);

