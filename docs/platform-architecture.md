# 跨境电商管理平台架构蓝图（2025-01-08）

## 1. 愿景与边界
- **目标**：为速卖通（自运营/全托管）、亚马逊、Ozon、Temu、TikTok、Lazada、Shopee 及独立站提供统一的运营、订单、库存与广告管理能力，形成一个可配置、可扩展的全渠道电商运营工作台。
- **现状**：仓库当前提供速卖通自运营/全托管、亚马逊、Ozon、独立站三个页面及若干 API，用于运营数据的查询与导入，但缺少订单、库存、广告和权限的闭环能力。
- **蓝图方向**：在现有页面与 Serverless API 的基础上，补齐多平台数据链路，新增订单、库存、广告及权限模块，并制定统一的开发约束与知识库，支撑快速迭代。

## 2. 平台地图
### 2.1 站点矩阵
| 平台 | 站点/渠道 | 页面入口 | 左侧模块 | 数据状态 | 查询 API | 上传 API | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 速卖通 | 自运营 Robot | `public/self-operated.html` | 详细数据 / 运营分析 / 产品分析（订单中心、广告中心占位） | ✅ 运营数据 | `/api/ae_query`, `/api/ae_self_operated/stats` | `/api/ae_upsert` | 默认站点 `ae_self_operated_a` |
| 速卖通 | 自运营 Poolslab | `public/self-operated.html` | 同上 | ✅ 运营数据 | 同上 | 同上 | 默认站点 `ae_self_operated_poolslab_store` |
| 速卖通 | 全托管 | `public/managed.html` | 详细数据 / 运营分析 / 产品分析（订单中心、广告中心占位） | ✅ 运营数据 | `/api/stats`, `/api/managed/daily-totals` | `/api/ingest` | 支持周/月报表 |
| Lazada | Lazada 数据枢纽 | `public/lazada.html` | 运营 / 产品 / 订单 / 广告 | ✅ 已上线 | `/api/lazada/stats` | `/api/lazada/orders`、`/api/lazada/ads` | 页面在站点切换时刷新三大 API，将指标写入 `site_metrics_daily`、`product_metrics_daily`、`orders`、`order_items`、`ad_campaigns`、`ad_metrics_daily` 并渲染卡片/表格 |【F:public/lazada.html†L1-L284】【F:lib/lazada-stats.js†L1-L192】【F:lib/lazada-orders.js†L1-L213】【F:lib/lazada-ads.js†L1-L182】
| Shopee | Shopee 站点壳层 | `public/shopee.html` | 运营 / 产品 / 订单 / 广告（待启用） | ⏳ 规划中 | —（待实现） | —（待实现） | 同上，等待 Shopee API 接入 |【F:public/shopee.html†L1-L88】【F:public/assets/platform-page.js†L1-L54】【F:public/assets/site-nav.js†L24-L309】
| 独立站 | poolsvacuum.com | `public/independent-site.html` | 渠道分析 / 产品分析（订单中心、广告中心占位） | ✅ 运营数据 | `/api/independent/stats` | `/api/independent/ingest` | Google Ads + Landing Page |
| 独立站 | icyberite.com | `public/independent-site.html` | 渠道分析 / 产品分析 / 广告中心（TikTok/Facebook） | ✅ 运营数据 | `/api/independent/stats` | `/api/independent/facebook-ingest`, `/api/independent/tiktok-ingest` | Facebook/TikTok Ads |
| 独立站 | 新增站点（Facebook/Google） | 统一入口 | 运营 / 产品 / 广告（订单中心待接入） | ⏳ 规划中 | `/api/independent/stats` | 对应 ingest 扩展 | 通过站点配置管理 |
| 亚马逊 | Marketplace 汇总 | `public/amazon-overview.html` | 运营 / 产品 / 订单（广告中心预留） | ✅ 运营数据 | `/api/amazon/query` | `/api/amazon/upsert` | 支持 SP-API 报表创建 |
| Ozon | Product Report | `public/ozon-detail.html` | 运营 / 产品 / 上传（订单模块通过 `/api/ozon/orders` 调用 Seller API，广告模块预留官方接口） | ✅ 运营数据 + 官方订单 API | `/api/ozon/stats`、`/api/ozon/fetch`（运营） | `/api/ozon/import`、`/api/ozon/orders`（订单） | 多视图模板，保持产品 ID 链路一致 |
| Temu | 占位页 | `public/temu.html` | 运营 / 产品 / 订单 / 广告（待启用） | ⏳ 等待接口 | 待规划 | 待规划 | 需接入订单/广告模块 |
| TikTok Shop | 占位页 | `public/tiktok.html` | 运营 / 产品 / 广告（订单占位） | ⏳ 等待接口 | `/api/independent/stats?channel=tiktok` 扩展 | `/api/independent/tiktok-ingest` 扩展 | 需补齐店播/短视频指标 |
| 广告中心 | 所有站点 | 新增仪表盘（待建） | 全局设置（仅广告角色可见） | ⏳ 规划中 | `/api/ads/stats`（见规格） | `/api/ads/ingest`（见规格） | 统一广告管理 |
| 订单中心 | 所有站点 | 新增仪表盘（待建） | 全局设置（站点侧边栏提供锚点） | ⏳ 规划中 | `/api/orders`（见规格） | `/api/orders/import`（见规格） | 订单全链路 |
| 库存中心 | 所有站点 | 新增仪表盘（待建） | 全局设置（仅库存角色可见） | ⏳ 规划中 | `/api/inventory`（见规格） | `/api/inventory/import`（见规格） | 批次 & 调拨 |
| 权限中心 | 所有站点 | 新增设置页（待建） | 全局设置（仅管理员可见） | ⏳ 规划中 | `/api/permissions`（见规格） | `/api/permissions` | 角色/资源矩阵 |

### 2.2 页面骨架
- `public/index.html`：门户页，自动跳转至自运营 Robot 站，负责统一导航入口。
- `public/self-operated.html`：自运营站点运营分析，内置 DataTables + ECharts + Flatpickr，并在 `ul.sub-nav` 中固定“详细数据/运营分析/产品分析/订单中心/广告中心”顺序（后两项按权限占位）。
- 自运营页面的加购类 KPI 与图表全部读取 `add_people` 字段：该值既代表加购次数，也用于判定“加购商品数”（`add_people > 0` 的 SKU 计入）。
- `public/managed.html`：全托管运营分析及跨平台导航，提供登录覆盖层与报表上传入口，同步实现左侧模块顺序与自运营保持一致。
- `public/site-management.html`：站点配置与动态站点注册表单，支持新增 Lazada/Shopee 等平台。
- `public/independent-site.html`：独立站多渠道分析，支持渠道切换及列显隐。
- `public/amazon-overview.html`、`public/amazon-ads.html`：亚马逊运营与广告视图。
- `public/ozon-detail.html` 系列：Ozon 指标与报表上传，订单中心子页面通过 `/api/ozon/orders` 调用 Seller API 下发订单头与明细，保持与运营数据的产品 ID 对齐；广告中心仍预留官方广告 API 接入。【F:api/ozon/orders/index.js†L1-L117】【F:api/ozon/fetch/index.js†L1-L160】
- `public/temu.html`、`public/tiktok.html`：统一导航和布局已接入，等待数据接口与左侧模块配置下发。
- `public/lazada.html`：接入 Lazada API，通过 `/api/lazada/stats`、`/api/lazada/orders`、`/api/lazada/ads` 渲染运营、产品、订单、广告模块；`public/shopee.html` 继续保留统一壳层与导航占位，待后续补齐 Shopee API。【F:public/lazada.html†L1-L284】【F:public/shopee.html†L1-L88】

### 2.2 模块布局与权限
- **站点模块注册**：所有站点的左侧导航由 `site_module_configs`（详见数据模型）驱动，默认挂载运营、产品、订单、广告四大模块，按站点配置决定是否启用或隐藏。
- **全局模块入口**：库存与权限属于全站共享模块，不出现在单个站点导航，统一通过全局设置面板呈现，仅对拥有 `inventory_manager`、`super_admin`、`operations_manager` 等授权角色可见。
- **可见性判定**：前端在页面加载前调用 `/api/site-modules` 拉取模块配置，需携带 `X-User-Role` 头部以按角色过滤结果，并根据返回的 `visibleRoles`、`enabled` 与 `hasDataSource` 决定是否渲染导航按钮。

### 2.3 API 分类
- **站点管理层**：`/api/sites`、`/api/site-configs`、`/api/site-sync`、`/api/site-modules`（模块注册与权限配置）。
- **运营数据层**：速卖通、独立站、亚马逊、Ozon、Lazada 已接入统一指标模型，落地到 `site_metrics_daily`、`product_metrics_daily` 等表；Temu/TikTok/Shopee 保持相同接口规范，字段可用性通过 `platform_metric_profiles` 与 API 响应暴露。
- **授权回调层**：Lazada 的授权流程由 `/api/lazada/oauth/start` 生成签名 `state` 并跳转 Lazada 登录页，回调 `/api/lazada/oauth/callback` 在校验签名后持久化刷新令牌并根据 `state.returnTo` 重定向回业务页面。流程依赖 `LAZADA_APP_KEY/LAZADA_APP_SECRET/LAZADA_REDIRECT_URI` 环境变量，且必须在站点配置 `config_json.seller_short_code`（或请求参数 `seller_short_code`）中提供 Lazada Seller Short Code 并确保控制台 App Management -> Auth Management 已登记对应卖家，回调地址需与 Lazada 控制台保持一致。
- **业务扩展层（规划）**：订单、库存、广告、权限四大模块的 REST 接口详见 `specs/openapi.yaml`。

## 3. 应用层次结构
### 3.1 前端（展示层）
- 静态页面部署于 Vercel 的 `/public` 目录，使用共享导航脚本 `public/assets/site-nav.js` 在加载时请求 `/api/site-configs`，自动合并默认站点并插入 Lazada、Shopee 等平台入口，再写入 `localStorage` 供壳层页面读取当前站点；脚本会缓存各平台站点列表并在未选择时自动持久化首个站点 ID（例如站点管理中新建的 `ozon_211440331`），并通过按平台及显示名称去重的逻辑避免 Lazada/Shopee 等站点重复出现在下拉菜单中。【F:public/assets/site-nav.js†L24-L330】【F:public/assets/site-nav.js†L563-L589】
- 各页面遵循统一主题（`assets/theme.css`），通过 Hash/Tab 管理多模块视图，为后续 React/TailAdmin 迁移保留 DOM ID。
- `admin.html` 作为全局管理后台，集成站点配置、权限矩阵与 `/api/site-sync` 的执行入口，新建站点时按平台预置 Lazada/Shopee/TikTok/Temu 模板并自动触发同步。【F:public/admin.html†L1-L420】

### 3.2 API（服务层）
- 所有 `/api/**` 函数运行于 Vercel Serverless，使用 Node.js + Postgres。
- 速卖通、独立站、亚马逊、Ozon 等接口已实现，新增模块将按 `specs/openapi.yaml` 扩展。
- `site-configs` 作为站点注册中心：新增 Lazada/Shopee 时在配置中添加 `platform=lazada/shopee`，选择 `data_source=lazada_api/shopee_api`，并触发 `/api/site-sync` 扩展表结构。【F:specs/openapi.yaml†L548-L609】

### 3.3 数据（存储层）
- 现有数据以 Postgres 日表（`*_daily`）为主，配合视图与物化视图。
- 新增模块的数据层按 `specs/data-model.sql` 设计，包括订单、订单明细、库存批次、广告活动与权限映射表。
- 指标定义统一维护在 `specs/metrics_dictionary.md`，确保多平台一致性。
- 授权凭据集中保存在 `integration_tokens` 表，仅允许服务端凭 `service_role` 访问，供 Lazada 等 OAuth 平台自动刷新访问令牌。【F:specs/data-model.sql†L29-L52】

## 4. 业务域模块设计
### 4.1 运营数据域
- **指标链路**：曝光 → 访客 → 加购 → 下单 → 支付 → 支付金额；若平台缺失某指标，将在 `platform_metric_profiles` 与 API 响应 `availableFields` 中声明。
- **页面承载**：自运营/全托管/独立站/亚马逊/Ozon 页面的 KPI 卡片、漏斗与趋势图均复用该链路。
- **数据入库**：通过 `ae_upsert`、`ingest`、`independent` 系列 API 执行字段映射、周期判定、去重。
- **扩展策略**：Temu/TikTok/Lazada/Shopee 复用 `site_metrics_daily`（见 SQL 规范），在 `site_configs` 中启用后即可自动出现在导航与自定义报表中。
- **字段适配**：若某站点不提供 `payments`、`revenue` 等字段，需在 `platform_metric_profiles` 中标记为 `optional` 或 `unsupported`，前端据此调整展示。

### 4.2 订单管理域
- **核心目标**：记录多平台订单、物流成本、结算状态，支撑订单漏斗、客单价与利润分析。
- **关键实体**：`orders`（订单头，内含物流费用、成本、结算字段）、`order_items`（商品明细）、`customers`（客户档案）、`inventory_movements`（引用出入库记录）。
- **字段补充**：`order_items` 在商品明细中同时存储 `product_name` 与可空的 `product_image`，便于像 Ozon 这类站点在前端直接展示商品标题与首图；其结构与迁移脚本在 `specs/data-model.sql` 与 `add_product_image_column.sql` 中维护。
- **数据来源**：平台 API（如 速卖通订单报表、亚马逊 SP-API、Ozon Seller API `/api/ozon/orders`）及人工 Excel 导入。
- **站点注册**：`/api/ozon/orders` 在落库前会根据传入 `siteId` 自动将 `site_configs` 中的配置写入 `sites` 表，以满足订单外键约束；因此站点管理中的站点 ID 应与平台账号编号对齐（如 Ozon 控制台的 `Ozon ID 211440331`），否则接口会返回缺失列表提示补录。
- **业务流程**：导入 → 标准化 SKU/站点 → 写入订单与明细 → 同步 `inventory_movements` → 更新订单状态（下单/发货/签收/完成）。
- **页面规划**：每个站点的“订单中心”在左侧导航中作为独立模块出现，模块内的筛选器、表格与详情抽屉不与运营/产品共享状态，通过 `/api/orders` 提供站点隔离的数据源。
- **Ozon 前端增强**：`ozon-orders.html` 在渲染 Seller API 的结果时，将商品明细置于首列并限制列宽 140px，新增“采购件数”列（聚合订单明细数量），并允许对商品明细、下单时间、状态、结算状态四列进行正序/倒序切换，以满足对账与履约场景下的快速定位。【F:public/ozon-orders.html†L1-L210】

### 4.3 库存管理域
- **目标**：追踪采购价、采购时间、入库数量、可售库存、在途库存、调拨与退货。
- **关键实体**：`inventory`（站点级库存）、`inventory_movements`（入/出/调拨记录）、`purchases`（采购单）、`suppliers`（供应商资料）。
- **与订单联动**：订单发货时创建负向 `inventory_movements`；采购入库记录采购价与到货日期，供利润计算。
- **页面规划**：库存总览（按站点）、调拨记录、库存预警与采购计划。

### 4.4 广告管理域
- **目标**：统一管理站点广告投放（Facebook/TikTok/Google/Amazon/Ozon/Temu），统计广告预算、消耗、曝光、访客、加购、支付与 GMV 贡献。
- **关键实体**：`ad_campaigns`（广告系列，记录目标、预算与受众）与 `ad_metrics_daily`（按日聚合指标）。
- **数据关联**：广告访客/下单数据与 `site_metrics_daily`、`orders` 进行站点 + 商品 + 渠道关联，支持广告归因分析。
- **页面规划**：广告控制台、渠道对比仪表盘、广告配置（预算/时段/受众）编辑器，作为站点侧边栏的“广告中心”模块单独加载；若站点缺少广告数据源，则模块将自动隐藏。

### 4.5 模块配置域
- **作用**：维护 `site_module_configs` 与 `platform_metric_profiles` 等表，协调站点模块的可见性、顺序与字段适配。
- **核心实体**：`site_module_configs`（模块主表，含可见角色数组）、`platform_metric_profiles`（字段覆盖矩阵）。
- **流程**：管理员在配置界面调整模块 → `/api/site-modules` 持久化 → 前端根据最新配置渲染导航与空状态。

### 4.6 权限管理域
- **目标**：为不同角色（运营、广告、订单、采购、财务、管理员）分配站点与模块访问权限。
- **关键实体**：`roles`（包含 JSON 权限矩阵）、`users`（持有 `role_id` 与激活状态）。
- **策略**：基于 RBAC + Resource Scope（站点/模块/操作）；API 通过中间件读取访问令牌中的角色、站点列表与内嵌权限 JSON。
- **页面规划**：权限中心 → 角色管理、成员管理、站点授权矩阵。

## 5. 数据流与同步
1. **数据采集层**：平台报表上传（Excel/CSV）、API 拉取（Amazon SP-API、TikTok/TEMU/Lazada/Shopee Official API）、Webhooks。
2. **标准化层**：`specs/openapi.yaml` 中的 ingest 接口负责字段映射、单位标准化、货币换算、SKU/站点匹配，同时在标准化阶段标记 `availableFields`。
3. **存储层**：写入 `specs/data-model.sql` 定义的事实表与维度表，触发物化视图刷新，并更新 `platform_metric_profiles`。
4. **分析层**：运营 KPI、订单分析、库存预测、广告归因通过 SQL/Materialized View 提供给前端，各模块独立访问。
5. **权限控制层**：在 API 层校验访问权限，并在前端据此隐藏或禁用模块入口。
6. **模块配置层**：`/api/site-modules` 按站点下发导航配置，确保左侧模块与全局设置可见性一致。

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

