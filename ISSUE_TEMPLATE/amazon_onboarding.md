---
name: 🛒 Amazon 站点接入 / 数据自动上传
about: 申请接入/完善 Amazon 数据自动对接
labels: ["amazon", "integration"]
---

### 目标
- [ ] 在页面导航增加“亚马逊”
- [ ] 实现 Amazon 数据自动入库（定时/回填）

### 数据来源与授权
- 账户区域/站点（NA/EU/JP 等）：
- 授权方式：
  - [ ] Amazon Selling Partner API (SP-API)
  - [ ] S3 导入（CSV/Parquet）
  - [ ] 其他：____
- 所需数据集（勾选）：
  - [ ] 报表：GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE
  - [ ] 报表：GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE
  - [ ] 报表：Advertising（如需）
  - [ ] 自定义：____

### 字段映射（示例）
| 目标字段           | Amazon 字段/报表名                  |
|--------------------|-------------------------------------|
| product_id         | asin / sku                          |
| stat_date          | reportDate / postedDate             |
| exposure           | impressions (Ads) / 为空则 0       |
| visitors           | sessions / 估算逻辑                 |
| add_people         | addToCart (可选)                    |
| add_count          | addToCartQty (可选)                 |
| pay_orders         | orderCount                           |
| pay_buyers         | buyerCount                           |
| pay_items          | units                                |

### 调度 & 频率
- [ ] 每日 08:00 UTC 拉取 T-1
- [ ] 失败重试 & 告警（Slack/邮件）

### 验收
- [ ] `/api/periods` 与 `/api/stats` 可返回 Amazon 维度
- [ ] 前端“亚马逊”页能展示 KPI/图表/明细
