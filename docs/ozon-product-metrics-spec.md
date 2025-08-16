# Ozon 产品指标数据规范

为了让 Codex 同时理解数据库表结构与前端展示逻辑，以下规范整合了 Supabase 数据库设计与页面交互说明。

## 1. 数据库设计（Supabase / PostgreSQL）
```sql
-- Ozon 产品报表宽表
CREATE TABLE IF NOT EXISTS public.ozon_product_report_wide (
  id                bigserial PRIMARY KEY,
  store_id          text NOT NULL,
  day               date NOT NULL,
  product_id        text NOT NULL,
  product_title     text,
  category_l1       text,
  category_l2       text,
  category_l3       text,
  brand             text,
  model             text,
  sales_scheme      text,
  sku               text,
  article           text,
  abc_by_amount     text,
  abc_by_qty        text,
  amount_ordered    numeric(18,2),
  amount_ordered_delta numeric(18,4),
  amount_share      numeric(10,6),
  amount_share_delta numeric(10,6),
  search_position_avg numeric(10,4),
  search_position_delta numeric(10,4),
  impressions_total bigint,
  impressions_total_delta numeric(18,4),
  conv_impr_to_order numeric(10,6),
  conv_impr_to_order_delta numeric(10,6),
  impressions_search_catalog bigint,
  impressions_search_catalog_delta numeric(18,4),
  conv_sc_to_cart   numeric(10,6),
  conv_sc_to_cart_delta numeric(10,6),
  add_to_cart_from_sc bigint,
  add_to_cart_from_sc_delta numeric(18,4),
  conv_sc_to_card   numeric(10,6),
  conv_sc_to_card_delta numeric(10,6),
  product_card_visits bigint,
  product_card_visits_delta numeric(18,4),
  conv_card_to_cart numeric(10,6),
  conv_card_to_cart_delta numeric(10,6),
  add_to_cart_from_card bigint,
  add_to_cart_from_card_delta numeric(18,4),
  conv_overall_to_cart numeric(10,6),
  conv_overall_to_cart_delta numeric(10,6),
  add_to_cart_total bigint,
  add_to_cart_total_delta numeric(18,4),
  conv_cart_to_order numeric(10,6),
  conv_cart_to_order_delta numeric(10,6),
  items_ordered     bigint,
  items_ordered_delta numeric(18,4),
  items_delivered   bigint,
  items_delivered_delta numeric(18,4),
  conv_order_to_buyout numeric(10,6),
  conv_order_to_buyout_delta numeric(10,6),
  items_buyout      bigint,
  items_buyout_delta numeric(18,4),
  items_cancel_by_cancel_date bigint,
  items_cancel_by_cancel_date_delta numeric(18,4),
  items_cancel_by_order_date bigint,
  items_cancel_by_order_date_delta numeric(18,4),
  items_return_by_return_date bigint,
  items_return_by_return_date_delta numeric(18,4),
  items_return_by_order_date bigint,
  items_return_by_order_date_delta numeric(18,4),
  avg_price         numeric(14,2),
  avg_price_delta   numeric(14,4),
  discount_from_your_price numeric(10,6),
  discount_from_your_price_delta numeric(10,6),
  price_index       numeric(10,6),
  promo_days        integer,
  ad_spend_ratio    numeric(10,6),
  ad_spend_ratio_delta numeric(10,6),
  promoted_days     integer,
  oos_days_28d      integer,
  ending_stock      bigint,
  fbo_supply_advice text,
  fbo_supply_qty    integer,
  avg_delivery_days numeric(10,4),
  reviews_count     integer,
  product_rating    numeric(10,4),
  inserted_at       timestamptz DEFAULT now(),
  CONSTRAINT ozon_prw_uniq UNIQUE (store_id, day, product_id)
);

CREATE INDEX IF NOT EXISTS idx_ozon_prw_store_day
  ON public.ozon_product_report_wide (store_id, day);
CREATE INDEX IF NOT EXISTS idx_ozon_prw_store_prod
  ON public.ozon_product_report_wide (store_id, product_id);

-- 原始 Ozon 行留存
CREATE TABLE IF NOT EXISTS public.ozon_raw_analytics (
  id          bigserial PRIMARY KEY,
  store_id    text,
  raw_row     jsonb NOT NULL,
  import_batch text,
  inserted_at timestamptz DEFAULT now()
);

-- 字段词典：列名、俄文说明与中文译文
CREATE TABLE IF NOT EXISTS public.ozon_metric_dictionary (
  std_field text PRIMARY KEY,
  ru_label  text,
  ru_desc   text,
  zh_desc   text
);
```

说明：
- 产品名保持 UTF-8 原文，不做翻译。
- 前端拼接 `https://ozon.ru/product/{product_id}` 生成跳转链接。
- 可按需扩展：在数据库中建立 KPI 统计视图，如 `avg_visit_rate`、`avg_atc_rate`、`avg_pay_rate` 等。

## 2. 前端页面设计（参考 `ozon-detail.html` 与 `ozon-analysis.html`）
### KPI 卡片
- 平均访客到加购转化率
- 平均加购到支付转化率
- 平均访客比（访客 / 曝光）
- 产品总数
- 有加购的产品数
- 有支付的产品数
- 本周期新品数（可点击筛选明细）

### 明细表
- 第一列为产品名：`product_title`，若为空则回退 `product_id`；点击跳转到 Ozon 商品页。
  - 曝光量 `search_exposure`
  - 访客数 `uv`
  - 浏览量 `pv`
  - 加购人数 `add_to_cart_users`
  - 加购件数 `add_to_cart_qty`
  - 支付件数 `pay_items`
  - 支付订单数 `pay_orders`
  - 支付买家数 `pay_buyers`
  - 转化率：访客→加购、加购→支付、访客比
- 支持 DataTable 筛选、排序、分页。

### 运营分析页
- 转化漏斗对比（本周期 vs 上周期）。
- 曝光 / 加购件数 / 支付订单数对比条形图。
- Top10 访客比。
- Top10 加购→支付转化率。

### 新品筛选（优化要求）
- KPI 卡片显示“本周期新品数”，点击后明细表仅展示新品。
- 卡片右上角出现“清除筛选”按钮，点击恢复完整数据。

上述规范确保数据库与前端展示一致，避免数据错位导致的空表问题。`analytics_report_2025-08-16_02_07.xlsx` 可作为当前数据源示例。
