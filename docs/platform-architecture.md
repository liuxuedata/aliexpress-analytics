# 跨境电商管理平台架构蓝图（2025-01-07）

## 1. 愿景与边界
- **目标**：为速卖通（自运营/全托管）、亚马逊、Ozon、Temu、TikTok、Lazada、Shopee 及独立站提供统一的运营、订单、库存与广告管理能力，形成一个可配置、可扩展的全渠道电商运营工作台。
- **现状**：仓库当前提供速卖通自运营/全托管、亚马逊、Ozon、独立站三个页面及若干 API，用于运营数据的查询与导入，但缺少订单、库存、广告和权限的闭环能力。
- **蓝图方向**：在现有页面与 Serverless API 的基础上，补齐多平台数据链路，新增订单、库存、广告及权限模块，并制定统一的开发约束与知识库，支撑快速迭代。

## 2. 平台地图
### 2.1 站点矩阵
| 平台 | 站点/渠道 | 页面入口 | 数据状态 | 查询 API | 上传 API | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 速卖通 | 自运营 Robot | `public/self-operated.html` | ✅ 运营数据 | `/api/ae_query`, `/api/ae_self_operated/stats` | `/api/ae_upsert` | 默认站点 `ae_self_operated_a` | 
| 速卖通 | 自运营 Poolslab | `public/self-operated.html` | ✅ 运营数据 | 同上 | 同上 | 默认站点 `ae_self_operated_poolslab_store` |
| 速卖通 | 全托管 | `public/managed.html` | ✅ 运营数据 | `/api/stats`, `/api/managed/daily-totals` | `/api/ingest` | 支持周/月报表 |
| 速卖通 | Lazada/Shopee 规划入口 | `public/managed.html`（导航预留） | ⏳ 规划中 | `/api/ae_query` 扩展 | `/api/ae_upsert` 扩展 | 通过 `site-configs` 动态注册 |
| 独立站 | poolsvacuum.com | `public/independent-site.html` | ✅ 运营数据 | `/api/independent/stats` | `/api/independent/ingest` | Google Ads + Landing Page |
| 独立站 | icyberite.com | `public/independent-site.html` | ✅ 运营数据 | `/api/independent/stats` | `/api/independent/facebook-ingest`, `/api/independent/tiktok-ingest` | Facebook/TikTok Ads |
| 独立站 | 新增站点（Facebook/Google） | 统一入口 | ⏳ 规划中 | `/api/independent/stats` | 对应 ingest 扩展 | 通过站点配置管理 |
| 亚马逊 | Marketplace 汇总 | `public/amazon-overview.html` | ✅ 运营数据 | `/api/amazon/query` | `/api/amazon/upsert` | 支持 SP-API 报表创建 |
| Ozon | Product Report | `public/ozon-detail.html` | ✅ 运营数据 | `/api/ozon/stats` | `/api/ozon/import` | 多视图模板 |
| Temu | 占位页 | `public/temu.html` | ⏳ 等待接口 | 待规划 | 待规划 | 需接入订单/广告模块 |
| TikTok Shop | 占位页 | `public/tiktok.html` | ⏳ 等待接口 | `/api/independent/stats?channel=tiktok` 扩展 | `/api/independent/tiktok-ingest` 扩展 | 需补齐店播/短视频指标 |
| 广告中心 | 所有站点 | 新增仪表盘（待建） | ⏳ 规划中 | `/api/ads/stats`（见规格） | `/api/ads/ingest`（见规格） | 统一广告管理 |
| 订单中心 | 所有站点 | 新增仪表盘（待建） | ⏳ 规划中 | `/api/orders`（见规格） | `/api/orders/import`（见规格） | 订单全链路 |
| 库存中心 | 所有站点 | 新增仪表盘（待建） | ⏳ 规划中 | `/api/inventory`（见规格） | `/api/inventory/import`（见规格） | 批次 & 调拨 |
| 权限中心 | 所有站点 | 新增设置页（待建） | ⏳ 规划中 | `/api/permissions`（见规格） | `/api/permissions` | 角色/资源矩阵 |

### 2.2 页面骨架
- `public/index.html`：门户页，自动跳转至自运营 Robot 站，负责统一导航入口。
- `public/self-operated.html`：自运营站点运营分析，内置 DataTables + ECharts + Flatpickr。
- `public/managed.html`：全托管运营分析及跨平台导航，提供登录覆盖层与报表上传入口。
- `public/site-management.html`：站点配置与动态站点注册表单，支持新增 Lazada/Shopee 等平台。
- `public/independent-site.html`：独立站多渠道分析，支持渠道切换及列显隐。
- `public/amazon-overview.html`、`public/amazon-ads.html`：亚马逊运营与广告视图。
- `public/ozon-detail.html` 系列：Ozon 指标与报表上传。
- `public/temu.html`、`public/tiktok.html`：统一导航和布局已接入，等待数据接口。

### 2.3 API 分类
- **站点管理层**：`/api/sites`、`/api/site-configs`、`/api/site-sync`。
- **运营数据层**：速卖通、独立站、亚马逊、Ozon 现有接口；Temu/TikTok/Lazada/Shopee 将复用统一指标模型。
- **业务扩展层（规划）**：订单、库存、广告、权限四大模块的 REST 接口详见 `specs/openapi.yaml`。

## 3. 应用层次结构
### 3.1 前端（展示层）
- 静态页面部署于 Vercel 的 `/public` 目录，使用共享导航脚本 `public/assets/site-nav.js` 维护跨站菜单。
- 各页面遵循统一主题（`assets/theme.css`），通过 Hash/Tab 管理多模块视图，为后续 React/TailAdmin 迁移保留 DOM ID。

### 3.2 API（服务层）
- 所有 `/api/**` 函数运行于 Vercel Serverless，使用 Node.js + Postgres。
- 速卖通、独立站、亚马逊、Ozon 等接口已实现，新增模块将按 `specs/openapi.yaml` 扩展。
- `site-configs` 作为站点注册中心：新增 Lazada/Shopee 时在配置中添加 `platform=lazada/shopee`，并触发 `/api/site-sync` 扩展表结构。

### 3.3 数据（存储层）
- 现有数据以 Postgres 日表（`*_daily`）为主，配合视图与物化视图。
- 新增模块的数据层按 `specs/data-model.sql` 设计，包括订单、订单明细、库存批次、广告活动与权限映射表。
- 指标定义统一维护在 `specs/metrics_dictionary.md`，确保多平台一致性。

## 4. 业务域模块设计
### 4.1 运营数据域
- **指标链路**：曝光 → 访客 → 加购 → 下单 → 支付 → 支付金额。
- **页面承载**：自运营/全托管/独立站/亚马逊/Ozon 页面的 KPI 卡片、漏斗与趋势图均复用该链路。
- **数据入库**：通过 `ae_upsert`、`ingest`、`independent` 系列 API 执行字段映射、周期判定、去重。
- **扩展策略**：Temu/TikTok/Lazada/Shopee 复用 `site_metrics_daily`（见 SQL 规范），在 `site_configs` 中启用后即可自动出现在导航与自定义报表中。

### 4.2 订单管理域
- **核心目标**：记录多平台订单、支付、发货、结算状态，支撑订单漏斗、客单价与利润分析。
- **关键实体**：`orders`（订单头）、`order_items`（商品明细）、`customers`（客户档案）、`fulfillments`（发货与物流）、`payments`（结算信息）。
- **数据来源**：平台 API（如 速卖通订单报表、亚马逊 SP-API、Ozon 订单导出）及人工 Excel 导入。
- **业务流程**：导入 → 标准化 SKU/站点 → 匹配库存批次 → 更新订单状态（下单/发货/签收/完成）。
- **页面规划**：新增 “订单中心” 仪表盘，包括订单列表、订单详情抽屉、状态统计与利润分析。

### 4.3 库存管理域
- **目标**：追踪采购价、采购时间、入库数量、可售库存、在途库存、分仓库存、调拨与退货。
- **关键实体**：`inventory_batches`（入库批次）、`inventory_snapshots`（每日库存快照）、`inventory_movements`（入/出/调拨记录）、`suppliers`（供应商资料）。
- **与订单联动**：订单发货时创建负向 `inventory_movements`；采购入库录入采购价与到货日期，供利润计算。
- **页面规划**：库存总览（按站点/仓库）、批次管理、库存预警与采购计划。

### 4.4 广告管理域
- **目标**：统一管理站点广告投放（Facebook/TikTok/Google/Amazon/Ozon/Temu），统计广告预算、消耗、曝光、访客、加购、支付与 GMV 贡献。
- **关键实体**：`ad_accounts`、`ad_campaigns`、`ad_sets`、`ad_creatives`、`ad_metrics_daily`。
- **数据关联**：广告访客/下单数据与 `site_metrics_daily`、`orders` 进行站点 + 商品 + 渠道关联，支持广告归因分析。
- **页面规划**：广告控制台、渠道对比仪表盘、广告配置（预算/时段/受众）编辑器。

### 4.5 权限管理域
- **目标**：为不同角色（运营、广告、订单、采购、财务、管理员）分配站点与模块访问权限。
- **关键实体**：`roles`、`permissions`（模块/页面/操作）、`role_permissions`、`user_roles`、`user_assignments`（站点范围）。
- **策略**：基于 RBAC + Resource Scope（站点/模块/操作）；API 通过中间件读取访问令牌中的角色与站点列表。
- **页面规划**：权限中心 → 角色管理、成员管理、站点授权矩阵。

## 5. 数据流与同步
1. **数据采集层**：平台报表上传（Excel/CSV）、API 拉取（Amazon SP-API、TikTok/TEMU/Lazada/Shopee Official API）、Webhooks。
2. **标准化层**：`specs/openapi.yaml` 中的 ingest 接口负责字段映射、单位标准化、货币换算、SKU/站点匹配。
3. **存储层**：写入 `specs/data-model.sql` 定义的事实表与维度表，触发物化视图刷新。
4. **分析层**：运营 KPI、订单分析、库存预测、广告归因通过 SQL/Materialized View 提供给前端。
5. **权限控制层**：在 API 层校验访问权限，并在前端据此隐藏或禁用模块入口。

## 6. 多平台扩展计划
- **Lazada/Shopee**：通过 `site-configs` 新增平台记录，扩展 `ae_upsert` 的字段映射；新增订单/库存/广告 ingest 端点对接官方 API。
- **Temu/TikTok Shop**：补齐运营指标与广告报表 ingest，支持订单与物流数据，通过权限模块限制负责团队访问。
- **独立站扩容**：在 `site-configs` 中添加新的独立站域名，复用独立站 ingest 接口，实现多渠道广告与订单数据的统一。

## 7. 知识库与约束
- **规则**：`rules.json` 定义架构、命名、API 合约、权限校验等硬性规范。
- **路线图**：`roadmap.yaml` 规划 v1/v2/v3 里程碑，明确各阶段交付物。
- **规格**：`specs/` 目录包含 OpenAPI、SQL 建模、指标字典，为开发与测试提供统一依据。

## 8. 执行建议
1. **建立 CI 审核**：新增规则、规格文件后，在 PR 中校验 `rules.json` 与 `specs/` 的更新，确保文档同步。
2. **模块并行推进**：优先实现运营 + 订单模块的基础数据链路，再并行开发库存与广告。
3. **权限优先上线**：即使功能处于 MVP，也需先完成角色/资源校验，保障多团队协作安全。
4. **监控与告警**：为 ingest/同步接口增加告警（成功率、延迟、数据缺失），保证多平台扩展后的可观测性。

