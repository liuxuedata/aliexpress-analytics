# Ozon 产品指标数据规范

为了让 Codex 同时理解数据库表结构与前端展示逻辑，以下规范整合了 Supabase 数据库设计与页面交互说明。

## 1. 数据库设计（Supabase / PostgreSQL）
```sql
-- Ozon 日度产品指标表
CREATE TABLE IF NOT EXISTS public.ozon_daily_product_metrics (
  id                bigserial PRIMARY KEY,
  store_id          text NOT NULL,              -- 店铺ID
  day               date NOT NULL,              -- 数据日期
  product_id        text NOT NULL,              -- 商品ID
  product_title     text,                       -- 商品标题（保持原文）
  category_name     text,                       -- 类目名称
  search_exposure   bigint,                     -- 曝光量
  uv                bigint,                     -- 访客数
  pv                bigint,                     -- 浏览量
  add_to_cart_users bigint,                     -- 加购人数
  add_to_cart_qty   bigint,                     -- 加购件数
  pay_items         bigint,                     -- 支付件数
  pay_orders        bigint,                     -- 支付订单数
  pay_buyers        bigint,                     -- 支付买家数
  inserted_at       timestamptz DEFAULT now(),

  UNIQUE(store_id, day, product_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_day
  ON public.ozon_daily_product_metrics (store_id, day);
CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_prod
  ON public.ozon_daily_product_metrics (store_id, product_id);
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
- 展示字段：
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
