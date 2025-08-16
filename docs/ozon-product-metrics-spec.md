# Ozon 产品指标数据规范

本文整合数据库结构与前端展示逻辑，便于在 Codex 中统一实现。

## 1. 数据库结构

### 表：`public.ozon_daily_product_metrics`

```sql
CREATE TABLE IF NOT EXISTS public.ozon_daily_product_metrics (
  id                bigserial PRIMARY KEY,
  store_id          text NOT NULL,
  day               date NOT NULL,
  product_id        text NOT NULL,
  product_title     text,
  category_name     text,
  search_exposure   bigint,
  uv                bigint,
  pv                bigint,
  add_to_cart_users bigint,
  add_to_cart_qty   bigint,
  pay_items         bigint,
  pay_orders        bigint,
  pay_buyers        bigint,
  inserted_at       timestamptz DEFAULT now(),
  UNIQUE(store_id, day, product_id)
);
```

表中指标与页面展示一一对应，所有数值型字段默认 0，产品名保留原文。导入完成后执行
`select public.refresh_ozon_first_seen(:start, :end);` 维护新品首登。

### 表：`public.ozon_raw_analytics`

保存原始报表行：

```sql
CREATE TABLE IF NOT EXISTS public.ozon_raw_analytics (
  id bigserial PRIMARY KEY,
  store_id text,
  raw_row jsonb NOT NULL,
  import_batch text,
  inserted_at timestamptz DEFAULT now()
);
```

## 2. 前端展示（`public/ozon-detail.html`）

- 上传组件调用 `/api/ozon/import`，携带 `store_id`。
- 成功后请求 `/api/ozon/stats` 获取产品指标。
- 明细表字段：产品名（带跳转）、曝光量、访客数、浏览量、加购人数、加购件数、支付件数、支付订单数、支付买家数，以及计算指标：访客→加购、加购→支付、访客比。
- 产品名链接格式：`https://ozon.ru/product/{product_id}`。

以上规范保证数据库建表、导入脚本与前端渲染保持一致，避免数据错位或空表问题。
