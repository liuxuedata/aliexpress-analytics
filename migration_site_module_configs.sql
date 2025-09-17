-- Atlas Sprint 1: site module configuration baseline
-- Creates site_module_configs / platform_metric_profiles tables and seeds default modules

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_module_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT,
  platform TEXT NOT NULL,
  module_key TEXT NOT NULL CHECK (module_key IN ('operations','products','orders','advertising','inventory','permissions')),
  nav_label TEXT NOT NULL,
  nav_order SMALLINT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  has_data_source BOOLEAN NOT NULL DEFAULT FALSE,
  visible_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_module_configs_unique
  ON public.site_module_configs (COALESCE(site_id, ''), platform, module_key);

CREATE TABLE IF NOT EXISTS public.platform_metric_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  module_key TEXT NOT NULL,
  available_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  optional_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, module_key)
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_module_configs_updated_at ON public.site_module_configs;
CREATE TRIGGER trg_site_module_configs_updated_at
  BEFORE UPDATE ON public.site_module_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_module_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metric_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_module_configs' AND policyname = 'site_module_configs_select_anon'
  ) THEN
    CREATE POLICY site_module_configs_select_anon
      ON public.site_module_configs
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_module_configs' AND policyname = 'site_module_configs_modify_service'
  ) THEN
    CREATE POLICY site_module_configs_modify_service
      ON public.site_module_configs
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'platform_metric_profiles' AND policyname = 'platform_metric_profiles_select_anon'
  ) THEN
    CREATE POLICY platform_metric_profiles_select_anon
      ON public.platform_metric_profiles
      FOR SELECT
      USING (true);
  END IF;
END $$;

INSERT INTO public.site_module_configs (site_id, platform, module_key, nav_label, nav_order, enabled, is_global, has_data_source, visible_roles)
VALUES
  (NULL, 'all', 'operations', '运营分析', 1, TRUE, FALSE, TRUE, ARRAY['super_admin','operations_manager','viewer']),
  (NULL, 'all', 'products', '产品分析', 2, TRUE, FALSE, TRUE, ARRAY['super_admin','operations_manager','viewer']),
  (NULL, 'all', 'orders', '订单中心', 3, TRUE, FALSE, TRUE, ARRAY['super_admin','operations_manager','order_manager','finance','viewer']),
  (NULL, 'all', 'advertising', '广告中心', 4, TRUE, FALSE, TRUE, ARRAY['super_admin','operations_manager','ad_manager','viewer']),
  (NULL, 'all', 'inventory', '库存管理', 5, TRUE, TRUE, TRUE, ARRAY['super_admin','inventory_manager','operations_manager']),
  (NULL, 'all', 'permissions', '权限管理', 6, TRUE, TRUE, FALSE, ARRAY['super_admin'])
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_metric_profiles (platform, module_key, available_fields, optional_fields, missing_fields, notes)
VALUES
  ('ae_self_operated', 'operations', ARRAY['impressions','visitors','orders','payments'], ARRAY['revenue','add_to_cart'], ARRAY[]::TEXT[], '速卖通自运营默认字段'),
  ('ae_self_operated', 'products', ARRAY['sku','product_name','orders','add_to_cart'], ARRAY['gross_profit'], ARRAY[]::TEXT[], '产品分析聚合字段'),
  ('independent', 'advertising', ARRAY['impressions','clicks','spend'], ARRAY['conversions','conversion_value'], ARRAY['atc_web'], '独立站广告矩阵示例')
ON CONFLICT (platform, module_key) DO UPDATE SET
  available_fields = EXCLUDED.available_fields,
  optional_fields = EXCLUDED.optional_fields,
  missing_fields = EXCLUDED.missing_fields,
  notes = EXCLUDED.notes,
  last_synced_at = now();

COMMIT;
