# Ozon Product Metrics Update

The Ozon daily product metrics table now tracks the product title and gains supporting indexes for common lookups.

```sql
ALTER TABLE public.ozon_daily_product_metrics
  ADD COLUMN IF NOT EXISTS product_title text;

-- Backfill existing rows if necessary
UPDATE public.ozon_daily_product_metrics m
SET product_title = NULLIF(m.product_title, '')
WHERE m.product_title IS NULL OR m.product_title = '';

CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_day
  ON public.ozon_daily_product_metrics (store_id, day);
CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_prod
  ON public.ozon_daily_product_metrics (store_id, product_id);
```
