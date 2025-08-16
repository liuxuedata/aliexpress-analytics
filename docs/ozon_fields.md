# Ozon 字段说明

此文档列出了 `ozon_daily_product_metrics` 表的核心字段，供前端展示与导入参考。

| 字段名 | 说明 | 备注 |
| --- | --- | --- |
| store_id | 店铺 ID | 上传时由用户提供 |
| day | 数据日期 | `YYYY-MM-DD` |
| product_id | 商品 ID | 如仅有 URL，则提取其中的数字 |
| product_title | 商品标题 | 保持原文 |
| exposure | 曝光量 | impressions |
| uv | 访客数 | sessions |
| pv | 浏览量 | pageviews |
| add_to_cart_users | 加购人数 |  |
| add_to_cart_qty | 加购件数 |  |
| pay_items | 支付件数 | items_sold |
| pay_orders | 支付订单数 | orders |
| pay_buyers | 支付买家数 | buyers |
字段名与页面上的指标一一对应，上传 Excel 时应确保列能映射到这些标准字段。
