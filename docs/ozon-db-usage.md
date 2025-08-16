# Ozon 数据库使用说明

## 指标目录 `ozon_metric_catalog`
- 使用 `section` 与 `subsection` 进行第一层/第二层分级。
- 所有指标（包括“Динамика/趋势”列）都需在此登记。
- 趋势列 `is_trend=true`，并通过 `base_metric_key` 指向其基础指标。
- `description_ru` / `description_zh` 可存储报表第三行的字段说明。

## 规范化事实表 `ozon_product_metrics_long`
- 按 `(store_id, day, product_id, metric_key)` 记录任意指标。
- 新增指标时，只需先在目录表插入 `metric_key`，无需修改表结构。

## 宽表 `ozon_product_report_wide`
- 存放前端常用指标，便于直查。
- 若需额外字段，可 `ALTER TABLE ADD COLUMN` 扩展。
- 导入数据时同步更新，以满足查询性能。

## 产品链接视图 `ozon_product_urls`
- 将 `product_id` 拼接成 `https://ozon.ru/product/{product_id}`，供前端跳转。

这些要点与导入流程配合，可确保 Ozon 报表的字段映射、数据存储与前端展示一致。
