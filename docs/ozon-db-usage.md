# Ozon 数据库使用说明

本项目将 Ozon 报表解析后写入两张表：

## 1. 日度产品指标 `ozon_daily_product_metrics`

| 字段 | 说明 |
| --- | --- |
| store_id | 店铺 ID，上传报表时提供 |
| day | 数据日期 `YYYY-MM-DD` |
| product_id | 商品 ID，仅保留数字部分 |
| product_title | 商品标题（俄/英原文） |
| category_name | 类目名称（若报表提供） |
| exposure | 曝光量 |
| uv | 访客数 |
| pv | 浏览量 |
| add_to_cart_users | 加购人数 |
| add_to_cart_qty | 加购件数 |
| pay_items | 支付件数 |
| pay_orders | 支付订单数 |
| pay_buyers | 支付买家数 |
| inserted_at | 数据入库时间 |

主键 `(store_id, day, product_id)` 采用 UPSERT 方式写入，多次导入同一报表不会重复。

## 2. 原始报表留存 `ozon_raw_analytics`

保存上传报表的原始行，便于审计与调试。

| 字段 | 说明 |
| --- | --- |
| store_id | 店铺 ID |
| raw_row | 原始 JSON 行 |
| import_batch | 文件名或批次标识 |
| inserted_at | 入库时间 |

## 3. 产品链接视图 `ozon_product_urls`

视图将 `product_id` 拼接成 `https://ozon.ru/product/{product_id}`，供前端跳转。

以上结构配合导入接口 `/api/ozon/import` 与查询接口 `/api/ozon/stats`，即可完成数据上传与展示。
