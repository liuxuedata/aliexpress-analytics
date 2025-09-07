# 跨境电商数据分析平台

## 项目概述
跨境电商数据分析平台，支持多平台、多渠道的广告数据分析，包括速卖通、亚马逊、TikTok Shop、Temu、Ozon等平台的数据整合与分析。

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

### 📈 自运营查询 API 更新
- `/api/ae_query` 现在返回 `visitor_ratio`、`add_to_cart_ratio` 和 `payment_ratio` 等比率字段的原始小数（例如 `0.15` 表示 15%），前端应使用 `formatPercentage` 等工具进行百分比格式化。

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