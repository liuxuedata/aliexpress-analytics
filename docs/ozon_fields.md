# Ozon 字段说明

此文档列出了 `ozon_daily_product_metrics` 表的核心字段，供前端展示与导入参考。

| 字段名 | 说明 | 备注 |
| --- | --- | --- |
| store_id | 店铺 ID | 上传时由用户提供 |
| day | 数据日期 | `YYYY-MM-DD` |
| product_id | 商品 ID | 如仅有 URL，则提取其中的数字 |
| product_title | 商品标题 | 保持原文 |
| impressions | 曝光量 | search_exposure |
| sessions | 访客数 | uv |
| pageviews | 浏览量 | pv |
| add_to_cart_users | 加购人数 |  |
| add_to_cart_qty | 加购件数 |  |
| items_sold | 支付件数 | pay_items |
| orders | 支付订单数 | pay_orders |
| buyers | 支付买家数 | pay_buyers |
| revenue | 销售额 | GMV |
| brand | 品牌 | 可选 |
| model | 型号 | 可选 |
| category_l1 | 一级类目 | 可选 |
| category_l2 | 二级类目 | 可选 |
| category_l3 | 三级类目 | 可选 |
| scheme | 销售模式 | 可选 |
| campaign | 广告活动 | 可选 |
| traffic_source | 流量来源 | 可选 |

字段名与页面上的指标一一对应，上传 Excel 时应确保列能映射到这些标准字段。
