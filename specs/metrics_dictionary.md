# 指标字典（2025-01-07）

| 指标 | 描述 | 计算口径 | 数据来源 |
| --- | --- | --- | --- |
| impressions | 曝光次数 | 平台报表中的展示次数。若无则从广告统计或站点埋点读取。 | site_metrics_daily.impressions / ad_metrics_daily.impressions |
| visitors | 访客数 | UV 访客，若报表给出访客与会话，则优先访客；独立站取 landing metrics 中的用户数。 | site_metrics_daily.visitors |
| add_to_cart | 加购次数 | 加入购物车事件次数。若平台只提供加购人数，需换算为次数（与 orders 表中的 quantity 相关）。 | site_metrics_daily.add_to_cart |
| orders | 下单数 | 确认订单数量（含未支付）。与 orders.status in ('created','paid',...) 对齐。 | site_metrics_daily.orders / orders 表 |
| payments | 支付订单数 | 已完成支付的订单数量，与 orders.status in ('delivered','completed') 或 settlement_status <> 'pending' 对齐。 | site_metrics_daily.payments / orders 表 |
| revenue | 支付金额 | 所有支付订单的金额合计，按 currency 字段记录。 | site_metrics_daily.revenue / orders.total |
| gmv | 商品成交总额 | orders.total 汇总；若使用 site_metrics_daily 则以 revenue 为准。 | orders.total |
| cost_of_goods | 货品成本 | 订单明细的 cost_price * quantity 合计，或库存记录中的最新成本价。 | order_items.cost_price、inventory.cost_price |
| logistics_cost | 物流成本 | 订单中的物流成本字段或外部报表提供的数据。 | orders.logistics_cost |
| gross_profit | 毛利 | revenue - cost_of_goods - logistics_cost - advertising_spend。 | 由订单、库存、广告数据计算 |
| advertising_spend | 广告消耗 | ad_metrics_daily.spend。 | ad_metrics_daily |
| advertising_roi | 广告投资回报 | revenue / advertising_spend（若 spend=0 则返回 null）。 | ad_metrics_daily + site_metrics_daily |
| visitor_to_cart_rate | 访客到加购转化率 | add_to_cart ÷ visitors。 | site_metrics_daily |
| cart_to_order_rate | 加购到下单转化率 | orders ÷ add_to_cart。 | site_metrics_daily |
| order_to_payment_rate | 下单到支付转化率 | payments ÷ orders。 | site_metrics_daily |
| inventory_turnover_days | 库存周转天数 | （平均库存成本 ÷ cost_of_goods）× 30。 | inventory + inventory_movements + order_items |
| fulfillment_latency | 发货时长 | inventory_movements.created_at（movement_type='out'）- orders.placed_at 的平均值（小时）。 | inventory_movements + orders |
| settlement_cycle_days | 结算周期 | orders.settlement_date - orders.placed_at 的平均值（天）。 | orders |

> 若指标需要跨表计算，必须在 BI 层或物化视图中实现，并记录在此文件中，以保持口径一致。

## 平台指标覆盖矩阵（2025-01-08）

| 平台 | 模块 | 必备字段 | 可选字段 | 当前缺失 |
| --- | --- | --- | --- | --- |
| ae_self_operated | operations | impressions, visitors, add_to_cart, orders | payments, revenue | 无 |
| ae_managed | operations | visitors, add_to_cart, payments | impressions, revenue | orders（由周/月报暂缺） |
| independent（Google/Facebook/TikTok） | operations | impressions, visitors | add_to_cart, orders, payments, revenue | 支付金额（部分渠道）、订单（待与订单中心联动） |
| amazon | operations | impressions, visitors, orders, payments, revenue | add_to_cart | 无 |
| ozon | operations | impressions, visitors, orders, revenue | add_to_cart, payments | 支付订单（待二次映射） |

> 若 `platform_metric_profiles` 中记录了新的字段差异，需同步更新此矩阵并通知前端按 `metadata.availableFields` 渲染。
