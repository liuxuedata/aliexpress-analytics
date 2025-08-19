-- Snapshot table for independent product metrics
create table if not exists public.indep_product_snapshot (
  site text not null,
  product text not null,
  day date not null,
  clicks numeric default 0,
  impr numeric default 0,
  conversions numeric default 0,
  conv_value numeric default 0,
  cost numeric default 0,
  primary key (site, product, day)
);

create or replace function public.refresh_independent_schema_cache()
returns void
language plpgsql
security definer
as $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

select public.refresh_independent_schema_cache();
