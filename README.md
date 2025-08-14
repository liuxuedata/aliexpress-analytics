# TailAdmin UI 优化施工指令

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
