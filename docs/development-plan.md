# 开发实施计划（2025-01-09）

## 1. 背景与目标
- 依据《跨境电商管理平台架构蓝图》和 `roadmap.yaml` 中 Atlas/Orion/Hyperion 里程碑，将速卖通（自运营/全托管）、亚马逊、Ozon、Temu、TikTok、独立站以及规划中的 Lazada、Shopee 接入统一的运营、订单、库存、广告与权限能力矩阵。
- 通过标准化的站点配置（`site_configs`、`site_module_configs`）、指标定义（`specs/metrics_dictionary.md`）、API 合约（`specs/openapi.yaml`）与数据模型（`specs/data-model.sql`），实现多团队并行开发时的协同与验收闭环。
- 本计划明确阶段节奏、工作流拆解与责任人分配，确保“站点快速接入 + 业务模块扩展 + 权限安全”三条主线在 2025 Q1 内形成可交付成果。

## 2. 阶段节奏
### 2.1 里程碑映射
| 阶段 | 时间窗口 | 目标 | 关键交付 | 验收门槛 |
| --- | --- | --- | --- | --- |
| Atlas（v1） | 2025-01-08 ~ 2025-02-15 | 打通站点接入、统一运营指标、上线订单中心 MVP | `/api/site-modules`、Temu/TikTok 运营接入、`/api/orders` MVP、Lazada/Shopee 配置 | 6 个站点运营数据实时，订单导入成功率 ≥95% |
| Orion（v2） | 2025-02-16 ~ 2025-03-31 | 库存中心 & 广告中心 & 权限中心上线 | `/api/inventory/*`、`/api/ads/*`、`/api/permissions/*` 及对应页面 | 库存扣减准确率 ≥98%，广告数据追踪 ≥5 站，权限误授权 0 |
| Hyperion（v3） | 2025-04-01 ~ 2025-05-31 | 融合利润分析、采购建议、告警编排 | GMV/毛利指标 API、财务结算表、告警调度脚本 | 利润分析准确率 ≥97%，自动化任务成功率 ≥98% |

### 2.2 Sprint 切分（Atlas 阶段）
| Sprint | 时间 | 目标 | 交付物 | Owner |
| --- | --- | --- | --- | --- |
| Sprint 0 | 01-08 ~ 01-14 | 对齐规范、补齐站点配置底座、Temu/TikTok 接入前置工作 | `site_configs` 清册、`platform_metric_profiles` 草案、Temu/TikTok 数据源映射 | Platform Integration (PI)、Data Engineering (DE) |
| Sprint 1 | 01-15 ~ 01-28 | `/api/site-modules` + 自运营/全托管/独立站前端导航改造、订单模型落库 | `/api/site-modules`、`site_module_configs` 迁移脚本、`orders/order_items` 表、页面导航切换 | PI、Frontend Experience (FX)、DE |
| Sprint 2 | 01-29 ~ 02-15 | Lazada/Shopee 接入、订单导入流程、Temu/TikTok 运营接口、验收与文档 | `/api/orders`（GET/POST/import）、Temu/TikTok 运营接口、`specs`/`rules.json` 更新、回归测试 | PI、DE、FX、QA/Release (QA) |

> Orion 与 Hyperion 阶段将沿用两周一个 Sprint 的节奏，具体任务拆解见下文工作流说明。

## 3. 工作流拆解与任务分配
### 3.1 平台与站点接入（Platform Integration Squad）
| Sprint | 任务 | Owner | 依赖 | 输出 |
| --- | --- | --- | --- | --- |
| S0 | 梳理现有 `site_configs`、`site_channel_configs`，补齐 Temu/TikTok/Lazada/Shopee 预置记录与站点模板 | PI | 现有配置脚本、`site_configuration_framework.sql` | 更新后的配置 SQL、数据字典附录 |
| S0 | 定义 `platform_metric_profiles` 初版，标记各平台缺失字段 | PI + DE | 指标字典 | `platform_metric_profiles` 表结构 & 种子数据 |
| S1 | 实现 `/api/site-modules`（GET/PATCH）并补充默认模块模板 | PI | `specs/openapi.yaml`、`rules.json` | Serverless 函数、单元测试、规格同步 |
| S1 | 迁移 `public/*` 导航使用 `site_module_configs`，实现模块可见性判定 | PI + FX | `/api/site-modules` | 前端导航脚本更新、Temu/TikTok 占位同步 |
| S2 | 完成 Lazada/Shopee 的数据 ingest 扩展，复用 `/api/ae_upsert` 映射 | PI | 字段映射表、Excel 模板 | 扩展后的 ingest 函数、样例文件 |
| S2 | Temu/TikTok 运营接口上线 (`/api/temu/query`、`/api/tiktok/query`) 并接入导航 | PI | 指标映射、`site_module_configs` | 新增 API、OpenAPI 声明、页面调用 |

### 3.2 数据建模与管道（Data Engineering Squad）
| Sprint | 任务 | Owner | 依赖 | 输出 |
| --- | --- | --- | --- | --- |
| S0 | 校验 `specs/data-model.sql`，为订单、库存、广告、权限表生成迁移脚本与视图模板 | DE | 现有 SQL 规范 | `orders`, `order_items`, `customers`, `inventory`, `inventory_movements`, `purchases`, `ad_campaigns`, `ad_metrics_daily`, `roles`, `users` 迁移脚本草案 |
| S1 | 构建订单/库存基础存储：`orders`, `order_items`, `customers`, `inventory`, `inventory_movements`，并配置触发器/索引 | DE | Sprint 0 草案 | 迁移脚本、回滚脚本、ER 图更新 |
| S1 | 设计 `order_import_jobs` & `ingest_logs` 用于导入审计 | DE | 订单域 | 表结构、触发器文档 |
| S2 | 扩展 `ae_upsert`、`independent` 等 ingest 以写入订单/广告关联字段（product_id、site_id） | DE | API 代码、指标字典 | 更新脚本、映射配置、回放报告 |
| S2 | 准备 Orion 所需的库存/广告物化视图与数据聚合存储（先以空壳保留） | DE | 数据模型 | 物化视图定义、刷新策略说明 |

### 3.3 前端体验与模块装配（Frontend Experience Squad）
| Sprint | 任务 | Owner | 依赖 | 输出 |
| --- | --- | --- | --- | --- |
| S0 | 制定站点导航组件改造方案，拆分运营/产品/订单/广告容器 | FX | 现有页面结构 | 改造方案、组件清单、CSS 影响评估 |
| S1 | 自运营、全托管、独立站页面接入 `/api/site-modules`，按模块返回渲染导航与空状态 | FX | `/api/site-modules` | 更新的 HTML/JS、模块占位、回退逻辑 |
| S1 | 订单中心 MVP 前端（列表页、筛选器、详情抽屉） | FX | 订单 API 草案 | 页面模板、交互设计、Mock 接口 |
| S2 | Temu/TikTok 页面切换真实数据、接入 KPI 卡片与趋势图 | FX | Temu/TikTok API | 更新页面、样式与组件测试 |
| S2 | 交付订单导入 UI（文件上传 + dry_run 展示）并对接 `/api/orders/import` | FX | 订单导入 API | 前端组件、错误提示、Docs |

### 3.4 访问控制与安全（Access & Security Squad）
| Sprint | 任务 | Owner | 依赖 | 输出 |
| --- | --- | --- | --- | --- |
| S0 | 明确角色矩阵、站点范围模型，并将默认策略写入 `rules.json` | AS | 现有规则文件 | 更新后的规则、角色-模块映射 |
| S1 | 在 `/api/site-modules` 与 `/api/orders` 引入角色校验（super_admin 默认全量，其余按 `site_module_configs.visible_roles`） | AS | 模块 API | 权限中间件、测试用例 |
| S2 | 准备 Orion 阶段的权限接口设计文档（`/api/permissions/*` OpenAPI 草案） | AS | OpenAPI | 更新的 `specs/openapi.yaml` 段落、审阅记录 |

### 3.5 质量保障与发布（QA & Release Squad）
| Sprint | 任务 | Owner | 依赖 | 输出 |
| --- | --- | --- | --- | --- |
| S0 | 建立 QA Checklist：数据对齐、权限校验、导航回归、上传 dry_run | QA | 既有页面与 API | 检查清单、测试用例库草稿 |
| S1 | 编写 `/api/site-modules`、`/api/orders` 基础回归脚本（postman/newman 或 vitest） | QA | 新 API | 自动化测试脚本、CI 集成计划 |
| S2 | 执行回归 + 性能测试，生成 Atlas 阶段验收报告 | QA | 所有交付物 | 测试报告、阻塞缺陷清单 |

## 4. 跨团队协作机制
- **例会节奏**：每周一进行跨 Squad Standup，同步需求变更与阻塞；Sprint 结束前一天举行 Demo + Retro。
- **需求变更流程**：任何站点或模块调整需在 `rules.json` 新增/修改项，并由 PI/AS 共同审核；若影响数据模型，必须同步更新 `specs/data-model.sql` 与迁移脚本。
- **文档同步**：所有交付须在 PR 中更新 README、`docs/platform-architecture.md`、`docs/development-plan.md` 与相关 `specs/` 文件，并通过 checklist 确认。
- **发布策略**：Atlas 阶段采用“功能开关 + 站点白名单”方式逐步开放，Temu/TikTok/Lazada/Shopee 初期仅对内部用户可见。

## 5. 验收与质量门槛
1. **指标一致性**：跨平台指标需对齐 `specs/metrics_dictionary.md`，并在 API 返回 `metadata.availableFields`/`missingFields`。
2. **数据安全**：权限校验必须在 Serverless 层实现，禁止仅靠前端隐藏；审核日志写入 `audit_log`。
3. **可观测性**：ingest 接口需记录作业 ID、行数、失败原因，Temu/TikTok/Lazada/Shopee 新增任务需纳入 `ingest_logs`。
4. **文档完整性**：新功能上线前，README、OpenAPI、SQL 模型、规则文件必须更新且通过 QA Checklist。
5. **回滚策略**：所有迁移脚本需提供 down 语句，API 需保留 dry_run，前端开关需支持 Feature Flag。

## 6. 主要风险与应对
| 风险 | 影响 | 对策 | Owner |
| --- | --- | --- | --- |
| 新平台字段缺失导致指标不完整 | Temu/TikTok/Lazada/Shopee 数据上线延迟 | 在 `platform_metric_profiles` 标记缺失项，前端显示占位并提示导入需求 | PI + DE |
| 订单与库存模型复杂，影响后续 Orion 迭代 | 库存扣减无法与订单对齐 | Atlas 阶段先实现订单-商品关联与 movement stub，Orion 阶段再补批次逻辑 | DE |
| 多团队协作导致规则/规格遗漏 | 上线后文档不一致 | 在 PR 模板中新增“规则/规格同步”强制项，QA 在验收时检查 | QA |
| 权限上线滞后造成越权访问 | 敏感数据泄露风险 | `/api/site-modules`、`/api/orders` 在 Atlas 期间即要求角色校验，通过 Feature Flag 控制 | AS |
| 新站点接入影响现有页面稳定性 | 导航或数据视图崩溃 | 引入 e2e 烟测脚本覆盖 Robot/Poolslab/Managed/Independent 页面 | QA + FX |

## 7. 下一步行动清单（本周内）
1. **PI**：提交 `site_configs` 补全脚本与 Temu/TikTok 字段映射文档；起草 `/api/site-modules` Handler 设计。
2. **DE**：输出订单域迁移脚本初稿，并在 `specs/data-model.sql` 中标注新表索引策略。
3. **FX**：完成导航组件重构方案评审，明确订单中心 MVP 的交互稿。
4. **AS**：更新 `rules.json` 权限段落，列出默认角色 → 模块映射矩阵。
5. **QA**：整理 Atlas 阶段测试矩阵（页面 × 模块 × 站点），并配置初始 Postman 集合。

> 本文档将在每个 Sprint 结束后更新，确保任务状态、风险与里程碑与实际进度保持一致。
