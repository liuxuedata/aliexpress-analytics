-- Lazada / Shopee 等 OAuth 平台凭据表初始化脚本
-- 目的：为 `integration_tokens` 提供标准结构、索引与 RLS，
--  以支撑服务端刷新访问令牌，避免 Supabase 因缺表报错。

-- 需要 pgcrypto 以使用 gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT NOT NULL REFERENCES public.site_configs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  scope TEXT[],
  meta JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_tokens_site_provider_key UNIQUE (site_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integration_tokens_site_provider
  ON public.integration_tokens(site_id, provider);

ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'integration_tokens'
      AND policyname = 'p_integration_tokens_service'
  ) THEN
    EXECUTE 'CREATE POLICY p_integration_tokens_service ON public.integration_tokens '
         || 'FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE public.integration_tokens IS '站点级 OAuth 凭据，仅服务端可访问';
COMMENT ON COLUMN public.integration_tokens.site_id IS '关联 site_configs.id 的站点 ID';
COMMENT ON COLUMN public.integration_tokens.provider IS '凭据所属平台（如 lazada/shopee）';
COMMENT ON COLUMN public.integration_tokens.refresh_token IS '长期有效的刷新令牌';
COMMENT ON COLUMN public.integration_tokens.access_token IS '短期访问令牌，可能为空';
COMMENT ON COLUMN public.integration_tokens.expires_at IS '访问令牌过期时间（UTC）';
COMMENT ON COLUMN public.integration_tokens.scope IS '授权作用域列表';
COMMENT ON COLUMN public.integration_tokens.meta IS '额外元数据，如店铺 ID、站点名称等';

-- 验证结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'integration_tokens'
ORDER BY column_name;
