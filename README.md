# 跨境电商数据分析平台

## 项目概述
跨境电商数据分析平台，支持多平台、多渠道的广告数据分析，包括速卖通、亚马逊、TikTok Shop、Temu、Ozon等平台的数据整合与分析。

## 全局架构规划（2025-01-07 更新）
- 👉 详见《[跨境电商管理平台架构蓝图](docs/platform-architecture.md)》，覆盖站点矩阵、模块职责、数据流及扩展计划。【F:docs/platform-architecture.md†L1-L118】
- **站点矩阵**：保留速卖通自运营（Robot/Poolslab）、全托管、独立站、亚马逊、Ozon 等既有页面，并为 Temu、TikTok、Lazada、Shopee 预留导航与数据接入路径，形成统一入口。【F:docs/platform-architecture.md†L12-L52】
- **模块蓝图**：除运营分析外，新增订单管理、库存管理、广告中心与权限中心四大业务域，分别负责订单闭环、库存批次与调拨、广告归因以及跨团队访问控制。【F:docs/platform-architecture.md†L54-L119】
- **数据流与指标**：统一使用“曝光 → 访客 → 加购 → 下单 → 支付 → 支付金额”链路，并将指标定义、OpenAPI 规范与 SQL 数据模型分别沉淀在 `specs/metrics_dictionary.md`、`specs/openapi.yaml`、`specs/data-model.sql` 中，确保跨平台一致性。【F:docs/platform-architecture.md†L73-L118】【F:specs/metrics_dictionary.md†L1-L20】【F:specs/openapi.yaml†L1-L369】【F:specs/data-model.sql†L1-L209】
- **多平台扩展**：通过 `site-configs` 注册新站点（如 Lazada/Shopee），并扩展 ingest/API 即可快速上线，相关步骤在蓝图及路线图中给出。【F:docs/platform-architecture.md†L31-L116】【F:roadmap.yaml†L1-L49】
- **执行指引**：优先建设权限校验、再并行推进订单与库存等模块，并在 CI 中强制校验规则与规格同步，降低多人协作风险。【F:docs/platform-architecture.md†L120-L162】【F:rules.json†L1-L54】

## 核心功能

### 🎯 多渠道架构 (2025-01-06 更新)
- **支持平台**：Google Ads、Facebook Ads、TikTok Ads
- **统一数据表**：
  - `independent_facebook_ads_daily` - Facebook Ads统一表
  - `independent_tiktok_ads_daily` - TikTok Ads统一表  
  - `independent_landing_metrics` - Google Ads统一表
- **站点渠道配置**：通过 `site_channel_configs` 表管理各站点的渠道启用状态
- **API端点**：
  - `/api/independent/facebook-ingest` - Facebook Ads数据上传
  - `/api/independent/tiktok-ingest` - TikTok Ads数据上传
  - `/api/independent/ingest` - Google Ads数据上传
  - `/api/independent/stats?channel=<channel>` - 多渠道数据查询
  - `/api/ae_query` - 速卖通自运营数据查询（`visitor_ratio`、`add_to_cart_ratio`、`payment_ratio` 等比率字段以0-1的小数返回）

### 📊 数据分析功能
- **运营分析**：KPI对比、趋势分析、周期对比
- **产品分析**：产品表现、转化漏斗、ROI分析
- **数据明细**：支持多维度筛选和导出

### 🏪 平台支持
- **速卖通**：全托管、自运营
- **亚马逊**：数据导入与分析
- **TikTok Shop**：广告数据分析
- **Temu**：平台数据整合
- **Ozon**：俄罗斯市场分析
- **独立站**：多渠道广告数据统一管理

## 站点框架与页面职责

### 页面矩阵概览

| 页面 | 核心用途 | 侧边模块 / 顶部导航 | 主要接口 |
| --- | --- | --- | --- |
| `index.html` | 作为统一入口并在 1 秒内跳转到默认自运营站点，保持所有用户的落地页一致 | 顶部渐变加载动画，自动重定向到 Robot 站 | —【F:public/index.html†L1-L58】 |
| `self-operated.html` | 速卖通自运营 Robot / Poolslab 站的数据面板，含运营、产品、明细三大分栏 | 左侧 `ul.sub-nav` 承载“详细数据/运营分析/产品分析”，站点选择器支持 Robot 与 Poolslab 互切 | `/api/ae_query`、`/api/ae_self_operated/stats`【F:public/self-operated.html†L1-L160】【F:public/assets/site-nav.js†L1-L200】 |
| `managed.html` | 速卖通全托管与跨平台导航（亚马逊、TikTok、Temu、Ozon、独立站等） | 顶部 `platform-nav` 列出速卖通/亚马逊/TikTok/Temu/Ozon/独立站入口，左侧模块沿用“详细数据/运营分析/产品分析”结构 | `/api/stats`、`/api/managed/daily-totals`、`/api/ingest`【F:public/managed.html†L2-L160】 |
| `site-management.html` | 管理 `site_configs` 记录与新增 Lazada/Shopee 等站点 | 卡片式站点网格 + 表单，配合站点同步 API | `/api/site-configs`、`/api/site-sync`【F:public/site-management.html†L1-L120】 |
| `independent-site.html` | 独立站 Facebook/Google/TikTok 渠道运营分析 | 顶部渠道筛选、左侧模块承载运营与产品视图 | `/api/independent/stats`、`/api/independent/*-ingest`【F:public/independent-site.html†L1-L120】 |
| `amazon-*.html` | 亚马逊运营与广告概览 | 左侧导航与全托管保持一致，拆分运营/广告页面 | `/api/amazon/query`、`/api/amazon/upsert`【F:public/amazon-overview.html†L1-L120】 |
| `ozon-*.html` | Ozon 报表上传与多指标分析 | 页面内包含上传入口、日期筛选和多图表列 | `/api/ozon/stats`、`/api/ozon/import`【F:public/ozon-detail.html†L1-L120】 |
| `temu.html` / `tiktok.html` | Temu、TikTok Shop 预置页面，等待后端数据接入 | 继承统一导航与布局，当前展示“建设中”占位 | —（待实现）【F:public/temu.html†L1-L38】【F:public/tiktok.html†L1-L36】 |

- **入口页 `public/index.html`**：作为平台门户，内置渐变过渡和加载动画，并在 1 秒内自动重定向到自运营 Robot 站，确保默认落地页一致。【F:public/index.html†L1-L58】
- **自运营页 `public/self-operated.html`**：聚合 DataTables、ECharts、Flatpickr 等库，提供站点选择、运营分析、产品分析与数据明细三大模块，支持 KPI 卡片、漏斗图和时间序列趋势；默认站点包含 Robot 与 Poolslab，两者在导航中可快速切换。【F:public/self-operated.html†L1-L160】【F:public/assets/site-nav.js†L1-L200】
- **全托管页 `public/managed.html`**：带登录覆盖层与统一侧边栏，顶部导航涵盖速卖通、亚马逊、TikTok Shop、Temu、Ozon、独立站等平台；页面内按 Hash 切分详细数据、运营分析与产品分析，并支持上传全托管周/月报表。【F:public/managed.html†L2-L160】
- **站点管理页 `public/site-management.html`**：提供深色顶栏 + 卡片式网格布局，内置站点列表与新增表单，可管理 `site_configs` 的名称、平台、数据源、模板等字段，支撑多平台扩展。【F:public/site-management.html†L1-L120】
- **独立站页 `public/independent-site.html`**：面向 Landing Page 运营分析，包含渠道选择、时间控件、KPI 卡片与数据明细，并保留列显隐、产品双击跳转等增强交互。【F:public/independent-site.html†L1-L120】
- **亚马逊总览 `public/amazon-overview.html`**：按 Amazon 指标构建 KPI、趋势图和明细表的总览页，侧边栏联动 `amazon-ads.html` 的广告视图。【F:public/amazon-overview.html†L1-L120】
- **Ozon 页面集**：`public/ozon-detail.html` 等页面提供上传入口、日期筛选及多图表分栏，涵盖明细、运营分析和产品洞察三种视图。【F:public/ozon-detail.html†L1-L120】
- **Temu/TikTok 占位页**：`public/temu.html` 与 `public/tiktok.html` 已接入统一导航与布局，目前标记为“建设中”，等待后端接口补齐。【F:public/temu.html†L1-L38】【F:public/tiktok.html†L1-L36】

### 站点配置与渠道表

- **`site_configs`**：存放站点 ID、平台、显示名称、数据源、模板等元数据，是所有站点页面与接口的注册中心。【F:docs/site-configuration-framework.md†L11-L45】
- **`site_channel_configs`**：按站点维护启用的渠道与对应的指标表（如 Facebook Ads/Google Ads），自运营、独立站、全托管等页面在加载时读取该表决定可用模块。【F:README.md†L340-L371】
- **索引与访问策略**：`site_configuration_framework.sql` 为 `site_configs` 建立 `platform`、`data_source` 索引，便于 Lazada、Shopee 等平台扩展；相关表启用了 RLS 策略以控制访问范围。【F:site_configuration_framework.sql†L215-L256】
- **站点同步**：创建或重命名站点后，通过 `/api/site-sync` 将 `ae_self_operated_daily` 等表中的 `site` 字段统一为新 ID，避免历史数据孤立。【F:api/site-sync/index.js†L33-L118】

```sql
CREATE TABLE public.site_configs (
  id text PRIMARY KEY,
  name text NOT NULL,
  platform text NOT NULL,
  display_name text NOT NULL,
  domain text,
  data_source text NOT NULL,
  template_id text,
  config_json jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_configs_platform ON public.site_configs(platform);
CREATE INDEX IF NOT EXISTS idx_site_configs_data_source ON public.site_configs(data_source);
```

*DDL 节选自站点配置框架脚本，便于在 Supabase 中快速核对表结构与索引。*【F:docs/site-configuration-framework.md†L11-L25】【F:site_configuration_framework.sql†L246-L248】

### 跨模块的产品 ID / 商品维度链路

- **运营 → 产品分析**：自运营查询接口会按 `product_id` 聚合曝光、访客、加购、支付等指标，既支持按时间粒度也支持按产品汇总，是产品分析与库存联动的基准数据。【F:api/ae_query/index.js†L35-L199】
- **广告 → 产品分析**：独立站 Facebook/TikTok/Google ingest 在上传时提取 `product_id`、`product_name` 并维护首购时间，确保广告转化可与商品维度关联。【F:api/independent/facebook-ingest/index.js†L8-L140】【F:api/independent/ingest/index.js†L69-L200】
- **Ozon / 亚马逊 → 库存**：Ozon 导入会将 `sku` 强制转换为字符串并聚合商品级指标；亚马逊查询同样以 ASIN 为主键，方便与订单、库存模块对齐。【F:api/ozon/import/index.js†L112-L200】【F:api/ozon/stats/index.js†L90-L181】【F:api/amazon/query/index.js†L21-L125】
- **库存 / 权限扩展**：库存与权限仍作为全局模块规划，但其接口必须复用上述商品标识，规则写在 `rules.json` 中，后续上线后可以直接与 `product_id` 维度对齐。【F:rules.json†L4-L76】

### 子站点左侧导航与模块隔离
- **独立模块容器**：每个站点页的侧边栏均以 `<ul class="sub-nav">` 注册分栏，分别对应 `section#detail`、`section#analysis`、`section#products` 等独立 DOM 容器，保证模块之间的样式与数据逻辑互不干扰。【F:public/self-operated.html†L520-L556】【F:public/managed.html†L82-L138】
- **新增子模块规划**：在既有“详细数据/运营分析/产品分析”基础上，为“订单中心”“广告中心”分别保留独立的导航锚点和内容面板，所有站点的左侧导航需统一包含四大业务模块（运营、产品、订单、广告），页面加载时根据权限与数据源决定是否渲染具体模块内容。
- **模块隔离策略**：各模块加载自身的数据与脚本，不共享状态；跨模块的数据联动（如广告带来的订单）通过后端聚合 API 提供汇总结果，再由前端各自渲染，避免直接跨 DOM 操作。
- **全局设置入口**：库存管理与权限管理位于全局设置（Settings）分组中，不出现在单个站点的侧边栏，只有具备相应角色的用户才会在顶栏或全局抽屉看到入口，避免越权访问。

### 站点与渠道分类
- **速卖通自运营**：默认提供 Robot 站（`ae_self_operated_a`）与 Poolslab 站（`ae_self_operated_poolslab_store`），可通过站点选择器和 `localStorage` 记忆切换。【F:public/assets/site-nav.js†L15-L82】
- **速卖通全托管**：通过顶部“速卖通 → 全托管”下拉菜单加载站点列表，配合上传控件与多图表分析。【F:public/managed.html†L9-L122】
- **独立站**：支持 Facebook、Google、TikTok 渠道，站点默认包含 `poolsvacuum.com` 与 `icyberite.com`，并在导航下拉与页面内同步显示。【F:public/assets/site-nav.js†L19-L123】
- **多平台扩展**：导航条保留 Amazon、Ozon、TikTok Shop、Temu、独立站入口，为未来新增 Lazada、Shopee 等站点提供统一壳层与导航位置。【F:public/managed.html†L25-L54】

- **运营分析**：各站点的运营模块继续承载曝光、访客、加购、支付链路，响应式面板以 `section#analysis` 或同级容器承载图表与 KPI 卡片。【F:public/self-operated.html†L624-L745】【F:public/managed.html†L144-L198】
- **产品分析**：保留独立的产品聚合与对比视图，模块在 `section#products` 中初始化并使用独立的数据请求，确保筛选器、表格与图表与其他模块隔离。【F:public/self-operated.html†L687-L775】【F:public/managed.html†L139-L208】
- **订单中心**：面向每个站点在左侧导航新增“订单中心”锚点，并使用 `orders`、`order_items`、`fulfillments`、`payments` 等表提供订单列表、利润拆解与履约状态；模块落位与字段映射详见架构蓝图与数据模型。【F:docs/platform-architecture.md†L71-L108】【F:specs/data-model.sql†L72-L133】
- **广告中心**：作为站点级模块独立呈现广告账户、系列与消耗数据，依托 `ad_metrics_daily` 与 `/api/ads/*` 接口构建，并在侧边栏提供导航占位；各站点不复用他站数据源，保障隔离。【F:docs/platform-architecture.md†L109-L148】【F:specs/openapi.yaml†L1337-L1445】【F:specs/data-model.sql†L201-L254】
- **库存中心（全局）**：库存相关视图不属于具体站点侧边栏，而在全局设置内统一展示，调用 `inventory_*` 表并受权限控制，仅对具备库存角色的用户开放。【F:docs/platform-architecture.md†L78-L108】【F:specs/data-model.sql†L136-L187】【F:rules.json†L26-L58】
- **权限中心（全局）**：权限管理独立于站点导航，采用 RBAC + 资源范围模型，通过角色、成员与授权矩阵控制各模块可见性，是全站共享的安全层。【F:docs/platform-architecture.md†L109-L148】【F:specs/data-model.sql†L256-L308】【F:rules.json†L47-L58】

## API 接口与参数说明

### 通用与站点管理
- `GET /api/health`：返回当前请求方法、URL、时间戳与运行环境的健康状态响应。【F:api/health.js†L1-L19】
- `GET /api/sites`：拉取 `sites` 表内启用站点列表，供前端导航和下拉选择使用。【F:api/sites/index.js†L1-L44】
- `GET /api/site-configs`：枚举 `site_configs` 全量配置，用于站点管理页面渲染；`POST` 请求可创建新站点，需要提供 `name`、`platform`、`display_name`、`data_source` 等字段，系统自动生成 `platform_name` 组合的站点 ID。【F:api/site-configs/index.js†L1-L87】
- `PUT /api/site-configs/[id]`：按 ID 更新站点配置字段，支持同步修改 `name`、`platform`、`data_source`、`config_json` 等信息；`DELETE` 可移除站点记录。【F:api/site-configs/[id].js†L1-L88】
- `POST /api/site-configs/update`：提供与 `PUT` 等价的更新入口，便于前端通过统一 POST 表单提交。【F:api/site-configs/update.js†L1-L74】
- `POST /api/site-sync`：在站点创建或重命名时同步 `ae_self_operated_daily` 等数据表的 `site` 字段，可在请求体中传入 `siteId`、`oldSiteId`、`action`（`create`/`update`）。【F:api/site-sync/index.js†L1-L111】
- **平台扩展指引**：`site_configs` 的 `platform` 字段为自由文本，可直接以 `lazada`、`shopee` 等平台名创建新配置；`data_source`/`template_id` 可引用 `data_source_templates` 中的预设映射，必要时通过 `generate_dynamic_table` 创建对应日表结构。【F:site_configuration_framework.sql†L1-L118】

### 速卖通 · 自运营（Robot / Poolslab）
- `GET /api/ae_query`：按 `start`、`end`、`site`（如 `ae_self_operated_a`）、`granularity`（`day`/`week`/`month`）和 `aggregate`（`time`/`product`）聚合自运营明细，返回曝光、访客、加购、支付及派生比率。【F:api/ae_query/index.js†L35-L199】
- `GET /api/ae_self_operated/stats`：面向运营分析页面，支持 `site`、`from`、`to`、`limit` 参数，返回时间序列、KPI 汇总和热门商品列表。【F:api/ae_self_operated/stats/index.js†L1-L118】
- `POST /api/ae_upsert[?dry_run=1]`：接收 JSON 数组或 `{rows:[]}` 结构，依据字段同义词映射入库；`dry_run=1` 时仅解析并返回样例，不写库。【F:api/ae_upsert/index.js†L1-L120】

### 速卖通 · 全托管
- `GET /api/stats`：按 `granularity`（`week`/`month`）与可选 `product_id`、`from`、`to`、`period_end`、`limit`、`offset` 查询 `managed_stats`，返回 KPI 概览及分页明细。【F:api/stats/index.js†L1-L118】
- `GET /api/managed/daily-totals`：基于 `from`、`to` 计算每日/每周访客、加购、支付总量，优先日粒度，若缺失自动回退周粒度。【F:api/managed/daily-totals/index.js†L1-L46】
- `POST /api/ingest[?dry_run=1]`：上传速卖通全托管 Excel（`file` 字段），自动识别统计周期（周日或月末），智能匹配表字段并写入 `managed_stats`；`dry_run` 模式仅返回解析结果。【F:api/ingest/index.js†L1-L140】

### 独立站 · Facebook / Google / TikTok
- `GET /api/independent/stats`：接受 `site`、`channel`、`from`、`to`、`limit` 及可选 `campaign`、`network`、`device` 等过滤条件，根据渠道自动映射数据表并返回 KPI、时间序列和明细。【F:api/independent/stats/index.js†L1-L176】
- `GET /api/independent/sites`：从统一的 `independent_landing_metrics` 表提取已存在的站点列表用于下拉选择。【F:api/independent/sites/index.js†L1-L20】
- `POST /api/independent/ingest`：用于 Google Ads Landing Pages 报表上传，接收 `file` 字段的 CSV/XLSX，解析 URL、渠道、费用等字段并写入统一表，自动去重主键冲突。【F:api/independent/ingest/index.js†L1-L160】
- `POST /api/independent/facebook-ingest`：解析 Facebook Ads 导出，拆分商品 ID/名称并维护 `independent_first_seen` 的首购时间；同样支持表字段映射与批量 upsert。【F:api/independent/facebook-ingest/index.js†L1-L160】
- `POST /api/independent/tiktok-ingest`：处理 TikTok Ads 报表文件，兼容多种日期格式并同步更新 `independent_first_seen`，保持商品首见时间一致。【F:api/independent/tiktok-ingest/index.js†L1-L160】

### 亚马逊
- `GET /api/amazon/query`：基于 `start`、`end`、`granularity` 聚合 `amazon_daily_by_asin`，返回会话、浏览、销量、GMV、Buy Box 占比等指标，支持按 ASIN 与时间桶合并。【F:api/amazon/query/index.js†L1-L86】
- `POST /api/amazon/upsert`：接受 JSON 数组或 `{rows:[]}`，按 `marketplace_id + asin + stat_date` 去重写入，支持批量分块上传。【F:api/amazon/upsert/index.js†L1-L59】
- `POST /api/amazon/report-create`：代理 Amazon SP-API 创建 `GET_SALES_AND_TRAFFIC_REPORT` 报表，需传 `dataStartTime`、`dataEndTime` 并校验相关环境变量。【F:api/amazon/report-create/index.js†L1-L97】
- `GET /api/amazon/report-poll`：查询报表处理状态，返回 `documentId` 等字段供后续下载流程使用。【F:api/amazon/report-poll/index.js†L1-L84】

### Ozon
- `GET /api/ozon/stats`：支持 `date` 或 `start`/`end` 范围，自动探测实际列名并聚合 SKU 指标（展示、访客、加购、下单等）；若未指定日期则返回最新日期列表供选择。【F:api/ozon/stats/index.js†L1-L120】
- `POST /api/ozon/import`：接收 `file` 字段的报表，执行俄文表头转蛇形、列重映射与必填校验后 upsert 到 `ozon_product_report_wide`，并处理 Schema 缓存刷新。【F:api/ozon/import/index.js†L1-L160】

### 模块配置与权限（规划中）
- `specs/openapi.yaml` 已给出 `/api/site-modules` 系列接口草案，用于集中下发站点模块顺序与可见性；当前仓库尚未实现对应的 Serverless 函数，后续上线时需同时遵循 `rules.json` 中的导航与权限约束。【F:specs/openapi.yaml†L576-L622】【F:rules.json†L8-L76】

## 项目知识库与约束
- `docs/platform-architecture.md`：全站架构蓝图，描述站点矩阵、模块职责、数据流与执行建议。【F:docs/platform-architecture.md†L1-L162】
- `rules.json`：约束站点命名、模块范围、API 约定、权限角色及文档同步要求，是代码审查的硬性规范。【F:rules.json†L1-L76】
- `roadmap.yaml`：规划 v1/v2/v3 的重点交付、指标、风险与缓解策略，指导多模块并行实施。【F:roadmap.yaml†L1-L63】
- `specs/`：包含 `openapi.yaml`、`data-model.sql`、`metrics_dictionary.md` 三大规格文件，统一接口、数据结构与指标口径。【F:specs/README.md†L1-L6】【F:specs/openapi.yaml†L1-L1454】【F:specs/data-model.sql†L1-L308】【F:specs/metrics_dictionary.md†L1-L40】

---

## Facebook Ads 优化记录 (2025-01-07)

### 🎯 优化目标
解决 Facebook Ads 数据显示问题，实现商品ID和商品名的分离显示，同时确保不影响现有 `poolsvacuum` 站点的功能。

### 🔧 核心优化内容

#### 1. 数据库结构优化
- **新增字段**：为 `independent_facebook_ads_daily` 表添加 `product_name` 字段
- **数据格式统一**：修复 `independent_first_seen` 表使用纯数字商品ID作为唯一标识
- **字段映射**：
  ```sql
  -- 新增字段
  ALTER TABLE public.independent_facebook_ads_daily 
  ADD COLUMN IF NOT EXISTS product_name TEXT;
  
  -- 修复first_seen表数据格式
  UPDATE independent_first_seen 
  SET product_identifier = TRIM(SPLIT_PART(product_identifier, ',', 1))
  WHERE product_identifier LIKE '%,%' 
    AND TRIM(SPLIT_PART(product_identifier, ',', 1)) ~ '^\d{10,}$';
  ```

#### 2. 后端API优化
- **数据上传逻辑**：自动拆分 `product_identifier` 为 `product_id` 和 `product_name`
  ```javascript
  // 拆分逻辑示例
  if (firstColumn.includes(',')) {
    const parts = firstColumn.split(',');
    productId = parts[0].trim();        // "50073860800824"
    productName = parts.slice(1).join(',').trim(); // "XREAL One AR Glasses..."
  }
  ```
- **商品标识提取**：优化 `extractProductId` 函数，优先使用 `product_id` 字段
- **产品聚合逻辑**：支持商品ID和商品名分离存储和查询
- **first_seen表更新**：确保使用纯数字商品ID作为唯一标识

#### 3. 前端显示优化
- **列定义更新**：Facebook Ads表格新增商品ID和商品名列
  ```javascript
  // 新增列定义
  { data: 'product_id', title: '商品ID', width: '120px' },
  { data: 'product_name', title: '商品名称', width: '200px' }
  ```
- **错误处理增强**：DataTables初始化失败时显示详细错误信息
- **调试信息优化**：添加详细的控制台输出帮助定位问题
- **表格渲染优化**：确保表格元素正确创建和初始化

#### 4. 兼容性保证
- **poolsvacuum站点保护**：所有优化都确保不影响现有Google Ads数据展示
- **向后兼容**：保留原有的 `product` 字段用于兼容性
- **渠道隔离**：Facebook Ads和Google Ads使用不同的数据处理逻辑

### 📁 相关文件
- `api/independent/facebook-ingest/index.js` - Facebook Ads数据上传逻辑
- `api/independent/stats/index.js` - 数据查询和聚合逻辑
- `public/independent-site.html` - 前端表格显示逻辑
- `add_product_name_column.sql` - 数据库字段添加脚本
- `fix_independent_first_seen_table.sql` - first_seen表修复脚本

### 🚀 部署记录
- **分支**：`feature/facebook-ads-complete-fields`
- **提交记录**：
  - 修复independent_first_seen表结构不一致问题
  - 修复Facebook Ads商品ID和商品名处理逻辑
  - 直接应用Facebook Ads显示优化
- **测试状态**：已部署到Vercel，等待功能验证

### 🔍 故障排除
如果遇到问题，请检查：
1. 浏览器控制台的详细错误信息
2. 网络请求是否成功返回数据
3. 数据库中的数据格式是否正确
4. 前端列定义与后端数据字段是否匹配

---

## TailAdmin UI 优化施工指令

## 目标
- 以 **TailAdmin React/Tailwind 模板** 为视觉与布局规范，优化本站架构与 UI，但 **不改变现有数据结构与接口**。
- 采用 **渐进式重构**：
  - 先在现有 HTML 页里替换导航 / 头部 / 卡片样式与栅格（外观壳）
  - 保持所有数据 DOM/ID 与 JS 初始化逻辑不变
  - 可选再新增一个 `/admin` React 仪表盘区

---

## 现状与约束（必须遵守）
1. **部署结构**
   - 平台：Vercel 静态 + Serverless
   - 静态文件：`/public/**`
   - API：`/api/**` Node 函数
   - 路由规则见 `vercel.json`

2. **需要优化的页面**（只换 UI 壳，不改数据 DOM/ID）
   - `/public/index.html`（全托管页面）
   - `/public/self-operated.html`（自运营页面）

3. **统一主题**
   - 使用 `assets/theme.css`（以 `theme_unified_0811b.css` 为准）
   - 深色侧边栏 + 浅色内容区
   - 高对比 DataTables、分段 Tabs 样式
   - `.kpi` 单行卡片（自运营页）布局保持不变

4. **接口合同不可更改**
   - `/api/ae_upsert`（`product_id, stat_date` 去重）
   - `/api/stats`、`/api/ingest` 等查询/上传 API 保持参数与返回结构不变

### 页面路由结构
- 自运营：`/self-operated.html#analysis`、`/self-operated.html#products`
- 全托管：`/managed.html#analysis`、`/managed.html#products`
- 独立站：`/independent-site.html?site=<name>#analysis`、`/independent-site.html?site=<name>#products`
  - 旧的 `operation-analysis.html` 与 `product-analysis.html` 页面已删除
  - 所有站点的运营分析与产品分析页在无用户选择时默认展示最近 7 天的数据范围
- 自运营运营分析页仅展示访客比、加购比、支付比，并附带上一周期趋势对比
- 自运营产品分析页的曝光、访客、加购与支付趋势以产品首次上架日期为起点按周绘制，并对缺失周自动补零
- 全托管产品分析页从商品上架周起展示曝光、访客、加购与支付的周趋势，并提供平均访客比、平均加购比、平均支付比及总曝光/访客/加购/支付买家数等 KPI 卡片，含上一周期对比与站点占比
- 全托管运营分析页提供过去三个月访客总数、加购总数、支付总数三条独立曲线
- 全托管产品分析页在商品选择行提供与数据明细页一致的周末日时间控件，并在该视图下隐藏顶部上传与周期栏
- 自运营与全托管数据明细页新增"曝光商品数"KPI，统计当前周期内曝光量大于 0 的商品数量并与上周期对比
- 独立站运营分析页展示平均点击率、平均转化率、曝光/点击/转化商品总数及本周期新品数等 KPI
  - 独立站产品分析以 landing page 作为产品维度，默认展示本周期曝光量最高的产品，选中后显示曝光、点击、转化总数与 CTR KPI 以及对应链接和首次上架日期
  - 运营分析与产品分析模块各自提供顶部时间控件，原先页面顶部的日期与上传栏已移除
  - 数据明细表中双击产品行可直接跳转到该产品的分析页
  - 产品上架日期与新品统计来源于 `independent_first_seen` 表，并据此计算站点累计产品总数

---

## 模板参考（新增说明）
- **文件路径**：`/_design/tailadmin-react---tailwind-react-dashboard-template.zip`
- **使用范围**：导航布局、卡片样式、面板、表格容器等 UI 结构
- **套用要求**：
  - 仅替换外观壳与样式类
  - 保留现有数据 DOM 结构、ID 和前端 JS 初始化逻辑（DataTables、ECharts 等）
  - 模板中的组件命名、Tailwind 类名可按需调整，但不得影响原功能

---

## 任务清单
### A. 接入 TailAdmin 外观壳
1. 从模板中提取导航、头部、卡片、面板、表格容器结构，应用到 `index.html` 与 `self-operated.html`
2. 不改动以下 DOM/ID：
   - DataTables 容器：`#report`
   - ECharts 容器：`#funnel`, `#sumCompareBar`, `#vrBar`, `#payBar` 等
   - 自运营 `.kpi .card` 布局（单行横向滚动）
3. `assets/theme.css` 必须在所有第三方 CSS 之后加载
4. 保留现有侧边栏导航结构与展开/高亮逻辑

### B. 可选：新增 React `/admin` 仪表盘
1. 在仓库根目录新增 `ui-dashboard/`，用 Vite/Next 初始化 TailAdmin
2. 构建产物输出到 `/public/admin/**`（静态托管）
3. `/admin` 页面调用现有 `/api/**` 接口，不改参数与返回

---

## 交付要求
- 代码提交到分支 `feature/tailadmin-skin`
- `/public/index.html` 与 `/public/self-operated.html` 本地可直接打开验证
- 主题统一：深色侧边栏 + 白色内容区
- 自运营 `.kpi` 保持单行卡片布局，窄屏横向滑动
- 所有上传、查询、渲染功能与上线前一致

- ## 技术架构

### 🏗️ 系统架构
- **前端**：HTML + JavaScript + DataTables + ECharts
- **后端**：Vercel Serverless Functions (Node.js)
- **数据库**：Supabase (PostgreSQL)
- **部署**：Vercel 静态托管 + API 路由

### 📁 项目结构
```
├── public/                 # 静态文件
│   ├── index.html         # 全托管页面
│   ├── self-operated.html # 自运营页面
│   ├── independent-site.html # 独立站页面
│   └── assets/            # 样式和脚本
├── api/                   # Serverless API
│   ├── independent/       # 独立站相关API
│   │   ├── facebook-ingest/ # Facebook Ads上传
│   │   ├── tiktok-ingest/   # TikTok Ads上传
│   │   ├── ingest/          # Google Ads上传
│   │   └── stats/           # 数据查询
│   └── ...
└── vercel.json           # Vercel配置
```

### 🗄️ 数据库设计

#### 统一表架构
- **`independent_facebook_ads_daily`**：Facebook Ads数据
- **`independent_tiktok_ads_daily`**：TikTok Ads数据
- **`independent_landing_metrics`**：Google Ads数据
- **`site_channel_configs`**：站点渠道配置

#### 关键字段
```sql
-- 统一字段
site, day, campaign_name, impressions, clicks, spend_usd, conversions

-- Facebook Ads特有
adset_name, reach, frequency, cpm, cpc_all, all_ctr, product_id, product_name

-- TikTok Ads特有  
adgroup_name, ctr, cpc, conversion_value

-- Google Ads特有
network, device, landing_path, landing_url
```

### 🔧 环境配置
```bash
# Supabase配置
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 其他配置
TEMP=/tmp  # 临时文件目录
```

## 部署说明

### 🚀 Vercel部署
1. 连接GitHub仓库到Vercel
2. 配置环境变量
3. 自动部署完成

### 📊 数据库初始化
```sql
-- 创建站点渠道配置表
CREATE TABLE public.site_channel_configs (
  id SERIAL PRIMARY KEY,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  table_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(site_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_site_channel_configs_site ON public.site_channel_configs(site_id);
CREATE INDEX IF NOT EXISTS idx_site_channel_configs_channel ON public.site_channel_configs(channel);

-- 插入默认配置
INSERT INTO public.site_channel_configs (site_id, site_name, channel, table_name, is_enabled) VALUES
('independent_poolsvacuum', 'poolsvacuum.com', 'google_ads', 'independent_landing_metrics', true),
('independent_icyberite', 'icyberite.com', 'facebook_ads', 'independent_facebook_ads_daily', true);
```

## 使用指南

### 📤 数据上传
1. 选择对应站点
2. 根据渠道选择上传API：
   - Google Ads → `/api/independent/ingest`
   - Facebook Ads → `/api/independent/facebook-ingest`
   - TikTok Ads → `/api/independent/tiktok-ingest`
3. 上传Excel/CSV文件

### 📈 数据分析
1. **数据明细**：查看原始数据，支持多维度筛选
2. **运营分析**：KPI对比和趋势分析
3. **产品分析**：产品表现和转化分析

### 🔍 渠道筛选
- 使用渠道选择器筛选特定广告平台数据
- 支持多渠道数据对比分析
- 自动聚合不同渠道的KPI指标

---

## 贡献 & 反馈

- 🐞 [报告 Bug](https://github.com/liuxuedata/aliexpress-analytics/issues/new?template=bug_report.md)
- ✨ [提出功能](https://github.com/liuxuedata/aliexpress-analytics/issues/new?template=feature_request.md)
- 🛒 [申请接入 Amazon](https://github.com/liuxuedata/aliexpress-analytics/issues/new?template=amazon_onboarding.md)
- 🔀 [发起 Pull Request](https://github.com/liuxuedata/aliexpress-analytics/compare)

> 提交 PR 时请遵循 [.github/pull_request_template.md](.github/pull_request_template.md)

## 更新日志

### v2.1.0 (2025-01-07)
- ✨ Facebook Ads商品ID和商品名分离显示
- 🔧 优化数据上传逻辑，自动拆分product_identifier
- 🛡️ 增强错误处理和调试信息
- 🔒 确保poolsvacuum站点功能不受影响
- 📚 完善Facebook Ads优化文档

### v2.0.0 (2025-01-06)
- ✨ 新增多渠道架构支持
- ✨ 支持Google Ads、Facebook Ads、TikTok Ads
- ✨ 统一数据表设计
- ✨ 站点渠道配置管理
- 🔧 保持向后兼容性
- 📚 完善技术文档