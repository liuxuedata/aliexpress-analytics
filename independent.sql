-- Add currency_code column and refresh schema cache for independent landing metrics
alter table if exists public.independent_landing_metrics
  add column if not exists currency_code text;

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
