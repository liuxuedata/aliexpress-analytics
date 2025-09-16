# 指标字典（2025-01-07）

| 指标 | 描述 | 计算口径 | 数据来源 |
| --- | --- | --- | --- |
| impressions | 曝光次数 | 平台报表中的展示次数。若无则从广告统计或站点埋点读取。 | site_metrics_daily.impressions / ad_metrics_daily.impressions |
| visitors | 访客数 | UV 访客，若报表给出访客与会话，则优先访客；独立站取 landing metrics 中的用户数。 | site_metrics_daily.visitors |
| add_to_cart | 加购次数 | 加入购物车事件次数。若平台只提供加购人数，需换算为次数（与 orders 表中的 quantity 相关）。 | site_metrics_daily.add_to_cart |
| orders | 下单数 | 确认订单数量（含未支付）。与 orders.status in ('created','paid',...) 对齐。 | site_metrics_daily.orders / orders 表 |
| payments | 支付订单数 | 已完成支付的订单数量，与 orders.status in ('paid','fulfilled','delivered','completed') 对齐。 | site_metrics_daily.payments / payments 表 |
| revenue | 支付金额 | 所有支付订单的金额合计，按 currency 字段记录。 | site_metrics_daily.revenue / orders.total |
| gmv | 商品成交总额 | orders.total 汇总；若使用 site_metrics_daily 则以 revenue 为准。 | orders.total |
| cost_of_goods | 货品成本 | 订单明细的 cost_price * quantity 合计，或库存批次成本映射。 | order_items.cost_price、inventory_batches.cost_price |
| logistics_cost | 物流成本 | fulfillments.shipping_cost 或外部报表提供。 | fulfillments.shipping_cost |
| gross_profit | 毛利 | revenue - cost_of_goods - logistics_cost - advertising_spend。 | 由订单、库存、广告数据计算 |
| advertising_spend | 广告消耗 | ad_metrics_daily.spend。 | ad_metrics_daily |
| advertising_roi | 广告投资回报 | revenue / advertising_spend（若 spend=0 则返回 null）。 | ad_metrics_daily + site_metrics_daily |
| visitor_to_cart_rate | 访客到加购转化率 | add_to_cart ÷ visitors。 | site_metrics_daily |
| cart_to_order_rate | 加购到下单转化率 | orders ÷ add_to_cart。 | site_metrics_daily |
| order_to_payment_rate | 下单到支付转化率 | payments ÷ orders。 | site_metrics_daily |
| inventory_turnover_days | 库存周转天数 | （平均库存成本 ÷ cost_of_goods）× 30。 | inventory_snapshots + order_items |
| fulfillment_latency | 发货时长 | fulfillments.shipped_at - orders.placed_at 的平均值（小时）。 | orders + fulfillments |
| settlement_cycle_days | 结算周期 | settlement_date - payments.paid_at 的平均值（天）。 | payments |

> 若指标需要跨表计算，必须在 BI 层或物化视图中实现，并记录在此文件中，以保持口径一致。
