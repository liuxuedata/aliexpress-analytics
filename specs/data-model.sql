-- 核心数据模型（2025-01-07）

-- 站点统一指标表，用于多平台运营数据
CREATE TABLE IF NOT EXISTS site_metrics_daily (
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

-- 订单域
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  site TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,
  platform TEXT NOT NULL,
  channel TEXT,
  order_number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN ('created','paid','fulfilled','delivered','completed','canceled')),
  placed_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL,
  subtotal NUMERIC(18,2) DEFAULT 0,
  discount NUMERIC(18,2) DEFAULT 0,
  shipping_fee NUMERIC(18,2) DEFAULT 0,
  tax NUMERIC(18,2) DEFAULT 0,
  total NUMERIC(18,2) DEFAULT 0,
  cost_of_goods NUMERIC(18,2) DEFAULT 0,
  logistics_cost NUMERIC(18,2) DEFAULT 0,
  settlement_status TEXT DEFAULT 'pending' CHECK (settlement_status IN ('pending','partial','settled')),
  settlement_date DATE,
  warehouse_id TEXT,
  remark JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site, order_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  product_name TEXT,
  quantity NUMERIC(18,2) NOT NULL,
  unit_price NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  cost_price NUMERIC(18,2) DEFAULT 0,
  warehouse_id TEXT,
  attributes JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_status TEXT NOT NULL CHECK (fulfillment_status IN ('pending','processing','shipped','delivered','returned')),
  carrier TEXT,
  tracking_number TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  shipping_cost NUMERIC(18,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method TEXT,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  paid_at TIMESTAMPTZ,
  settlement_batch TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 库存域
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  batch_code TEXT,
  supplier_id UUID REFERENCES suppliers(id),
  quantity NUMERIC(18,2) NOT NULL,
  quantity_available NUMERIC(18,2) NOT NULL,
  cost_price NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  purchased_at DATE,
  received_at DATE,
  expiration_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  batch_id UUID REFERENCES inventory_batches(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('inbound','outbound','adjustment','transfer')),
  quantity NUMERIC(18,2) NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  stat_date DATE NOT NULL,
  quantity_on_hand NUMERIC(18,2) NOT NULL,
  quantity_reserved NUMERIC(18,2) NOT NULL DEFAULT 0,
  quantity_in_transit NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site, warehouse_id, sku, stat_date)
);

-- 广告域
CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  account_external_id TEXT NOT NULL,
  site TEXT,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform, account_external_id)
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  site TEXT,
  name TEXT NOT NULL,
  objective TEXT,
  status TEXT,
  budget NUMERIC(18,2),
  budget_currency TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT,
  bid_strategy TEXT,
  targeting JSONB,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id UUID NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  creative_type TEXT,
  destination_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID REFERENCES ad_sets(id) ON DELETE SET NULL,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  stat_date DATE NOT NULL,
  impressions NUMERIC(18,2) DEFAULT 0,
  clicks NUMERIC(18,2) DEFAULT 0,
  visitors NUMERIC(18,2) DEFAULT 0,
  add_to_cart NUMERIC(18,2) DEFAULT 0,
  orders NUMERIC(18,2) DEFAULT 0,
  payments NUMERIC(18,2) DEFAULT 0,
  spend NUMERIC(18,2) DEFAULT 0,
  revenue NUMERIC(18,2) DEFAULT 0,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, ad_set_id, creative_id, stat_date)
);

-- 权限域
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  site_scope TEXT[],
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS permission_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  site_scope TEXT[] DEFAULT ARRAY[]::TEXT[],
  module_scope TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  target_id UUID REFERENCES users(id),
  change_set JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

