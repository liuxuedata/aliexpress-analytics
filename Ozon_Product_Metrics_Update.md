# Ozon Product Metrics Update（for Codex）

## 1. 数据库调整
```sql
-- 确保有 product_title 列
ALTER TABLE public.ozon_daily_product_metrics
  ADD COLUMN IF NOT EXISTS product_title text;

-- 回填：优先已有的通用列；其次把之前的俄/中列合并（如果存在）
UPDATE public.ozon_daily_product_metrics m
SET product_title = COALESCE(
  NULLIF(m.product_title, ''),
  NULLIF(m.product_title_ru, ''),
  NULLIF(m.product_title_zh, '')
)
WHERE m.product_title IS NULL OR m.product_title = '';

-- 可选：清理旧列（如需）
-- ALTER TABLE public.ozon_daily_product_metrics DROP COLUMN IF EXISTS product_title_ru;
-- ALTER TABLE public.ozon_daily_product_metrics DROP COLUMN IF EXISTS product_title_zh;

-- 索引建议（已有可略）
CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_day   ON public.ozon_daily_product_metrics (store_id, day);
CREATE INDEX IF NOT EXISTS idx_ozon_dpm_store_prod  ON public.ozon_daily_product_metrics (store_id, product_id);
```

## 2. 产品 URL 拼接
不在数据库层生成 URL，避免 PG 托管兼容性问题。**前端拼接即可**：
```js
const productUrl = `https://ozon.ru/product/${product_id}`;
```

## 3. 前端展示规范
- 明细表/分析页 **产品名列**：
  - 文本：`product_title`（保持原文，俄文/英文均可）
  - 超链接：点击跳转到 Ozon 落地页
  - 示例：
    ```html
    <a href={"https://ozon.ru/product/" + product_id} target="_blank" rel="noopener">
      {product_title || product_id}
    </a>
    ```
- 若 `product_title` 为空，回退展示 `product_id`。

## 4. 给 Codex 的开发指导
1. 使用现有的 `product_id` + `product_title` 字段，不再额外生成 `product_url` 列。
2. 前端在渲染时拼接 URL，点击跳转至 Ozon 商品页。
3. 产品名保持原文（UTF-8 俄文/英文），不做翻译。
4. 确保 DataTable 筛选和 KPI 卡片展示时，产品名均为可点击的跳转链接。
