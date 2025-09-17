-- 核心数据模型（2025-01-08 修订版）
-- 本文件同步 Phase 2 管理功能迁移脚本，覆盖订单、库存、广告、权限模块的最新表结构、索引、触发器与种子数据。
-- 运营域的日指标表（site_metrics_daily）保持不变，用于承载曝光/访客/加购/支付等多平台公共指标。

-- 1. 运营指标统一表
CREATE TABLE IF NOT EXISTS public.site_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,
  platform TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'organic',
  stat_date DATE NOT NULL,
  impressions NUMERIC(18,2) DEFAULT 0,
  visitors NUMERIC(18,2) DEFAULT 0,
  add_to_cart NUMERIC(18,2) DEFAULT 0,
  orders NUMERIC(18,2) DEFAULT 0,
  payments NUMERIC(18,2) DEFAULT 0,
  revenue NUMERIC(18,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site, channel, stat_date)
);

-- 2. 站点模块配置（驱动左侧导航与全局模块）
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
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 允许 site_id 为空时退化为平台级配置的唯一性约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_module_configs_unique
  ON public.site_module_configs (COALESCE(site_id, ''), platform, module_key);

-- 3. 平台指标覆盖矩阵
CREATE TABLE IF NOT EXISTS public.platform_metric_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  module_key TEXT NOT NULL,
  available_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  optional_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (platform, module_key)
);

-- 4. 权限域：角色与用户
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role_id UUID REFERENCES public.roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 5. 产品分类与主数据
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES public.categories(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id),
  brand VARCHAR(100),
  weight DECIMAL(10,3),
  dimensions JSONB,
  images JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. 供应商与采购
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  contact_info JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_no VARCHAR(50) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  purchase_date DATE NOT NULL,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 依赖既有的 public.sites 站点维表（由站点同步脚本维护）以约束 site_id 外键。
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  site_id TEXT REFERENCES public.sites(id),
  available_qty INTEGER DEFAULT 0,
  reserved_qty INTEGER DEFAULT 0,
  min_stock_level INTEGER DEFAULT 0,
  max_stock_level INTEGER DEFAULT 0,
  cost_price DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  site_id TEXT REFERENCES public.sites(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment')),
  quantity INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- orders.site_id 依赖 public.sites 记录，确保站点导航与订单数据一致。
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  site TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(50) UNIQUE NOT NULL,
  site_id TEXT REFERENCES public.sites(id),
  platform TEXT NOT NULL,
  channel TEXT,
  customer_id UUID REFERENCES public.customers(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled')),
  placed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  currency VARCHAR(3) DEFAULT 'USD',
  subtotal DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  shipping_fee DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  cost_of_goods DECIMAL(10,2) DEFAULT 0,
  logistics_cost DECIMAL(10,2) DEFAULT 0,
  settlement_status VARCHAR(20) DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'partial', 'settled')),
  settlement_date DATE,
  warehouse_id TEXT,
  remark JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  sku VARCHAR(100),
  product_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 广告模块复用站点维表以保持站点级隔离和权限控制。
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id TEXT REFERENCES public.sites(id),
  platform VARCHAR(20) NOT NULL,
  campaign_id VARCHAR(100) NOT NULL,
  campaign_name TEXT NOT NULL,
  objective VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  budget_daily DECIMAL(10,2),
  budget_total DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  target_audience JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, platform, campaign_id)
);

CREATE TABLE IF NOT EXISTS public.ad_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.ad_campaigns(id),
  site_id TEXT REFERENCES public.sites(id),
  platform VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  conversions BIGINT DEFAULT 0,
  conversion_value DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(5,4) DEFAULT 0,
  cpc DECIMAL(10,4) DEFAULT 0,
  cpm DECIMAL(10,4) DEFAULT 0,
  roas DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

-- 10. 辅助索引
CREATE INDEX IF NOT EXISTS idx_orders_site_id ON public.orders(site_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(placed_at);

CREATE INDEX IF NOT EXISTS idx_inventory_site_id ON public.inventory(site_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_site_id ON public.ad_campaigns(site_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform ON public.ad_campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_campaign ON public.ad_metrics_daily(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_daily_date ON public.ad_metrics_daily(date);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_site ON public.inventory_movements(site_id);

-- 11. 更新时间触发器
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ad_campaigns_updated_at BEFORE UPDATE ON public.ad_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_site_module_configs_updated_at BEFORE UPDATE ON public.site_module_configs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. 行级安全（Phase 2 先开放访问，后续迭代收紧策略）
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_module_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_roles_all ON public.roles FOR ALL TO anon USING (true);
CREATE POLICY p_users_all ON public.users FOR ALL TO anon USING (true);
CREATE POLICY p_products_all ON public.products FOR ALL TO anon USING (true);
CREATE POLICY p_inventory_all ON public.inventory FOR ALL TO anon USING (true);
CREATE POLICY p_orders_all ON public.orders FOR ALL TO anon USING (true);
CREATE POLICY p_ad_campaigns_all ON public.ad_campaigns FOR ALL TO anon USING (true);
CREATE POLICY p_site_module_configs_all ON public.site_module_configs FOR ALL TO anon USING (true);

-- 13. 默认种子数据
INSERT INTO public.roles (name, description, permissions) VALUES
('super_admin', '超级管理员', '{
    "sites": ["read", "write", "delete"],
    "orders": ["read", "write", "delete"],
    "inventory": ["read", "write", "delete"],
    "ads": ["read", "write", "delete"],
    "users": ["read", "write", "delete"]
}'),
('operations_manager', '运营管理员', '{
    "sites": ["read", "write"],
    "orders": ["read", "write"],
    "inventory": ["read"],
    "ads": ["read", "write"]
}'),
('order_manager', '订单管理员', '{
    "sites": ["read"],
    "orders": ["read", "write", "delete"],
    "inventory": ["read"]
}'),
('inventory_manager', '库存管理员', '{
    "sites": ["read"],
    "orders": ["read"],
    "inventory": ["read", "write", "delete"]
}'),
('ad_manager', '广告管理员', '{
    "sites": ["read"],
    "ads": ["read", "write", "delete"]
}'),
('finance', '财务', '{
    "sites": ["read"],
    "orders": ["read"],
    "inventory": ["read"]
}'),
('viewer', '查看者', '{
    "sites": ["read"],
    "orders": ["read"],
    "inventory": ["read"],
    "ads": ["read"]
}')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.site_module_configs (site_id, platform, module_key, nav_label, nav_order, enabled, is_global, has_data_source, visible_roles) VALUES
(NULL, 'all', 'operations', '运营分析', 1, TRUE, FALSE, TRUE, ARRAY['super_admin', 'operations_manager', 'viewer']),
(NULL, 'all', 'products', '产品分析', 2, TRUE, FALSE, TRUE, ARRAY['super_admin', 'operations_manager', 'viewer']),
(NULL, 'all', 'orders', '订单中心', 3, TRUE, FALSE, TRUE, ARRAY['super_admin', 'operations_manager', 'order_manager', 'finance', 'viewer']),
(NULL, 'all', 'advertising', '广告中心', 4, TRUE, FALSE, TRUE, ARRAY['super_admin', 'operations_manager', 'ad_manager', 'viewer']),
(NULL, 'all', 'inventory', '库存管理', 5, TRUE, TRUE, TRUE, ARRAY['super_admin', 'inventory_manager', 'operations_manager']),
(NULL, 'all', 'permissions', '权限管理', 6, TRUE, TRUE, FALSE, ARRAY['super_admin'])
ON CONFLICT DO NOTHING;
