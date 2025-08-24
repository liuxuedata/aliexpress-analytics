# ICYBERITE（icyberite.com）— 独立站统计平台：网站与数据库架构设计提案（基于 Facebook 报表优化版）

> 面向 Codex 的技术方案草案（可直接据此开始数据库与网站架构设计）。

---

## 0. 背景与目标
- **站点**：`icyberite.com`（独立站）。
- **参考**：整体信息架构与 UI 交互可复用现有 `poolsvacuum.com` 的方案与代码组织；但**数据模型与报表结构不同**，因 icyberite 的主投放渠道为 **Meta/Facebook**。
- **核心诉求**：
  1) 建立**可扩展的多站点 & 多渠道**统计平台；
  2) 支持 **Facebook（Meta）** 报表的标准化入库、清洗、聚合与可视化；
  3) 预留 **Google 与 Facebook** 的**自动化上传/分发**通道（任务拆分、幂等、失败重试）；
  4) 后续新增站点（或新增渠道）不破坏既有模型，只需增量配置与轻量开发。

> 本提案已根据提供的《icyberite 周统计.xlsx》示例报表字段进行映射优化。

---

## 1. 总体架构（复用 + 差异化）

### 1.1 技术栈
- **前端**：静态页面 + ECharts + DataTables（与 poolsvacuum 一致），按需新增 Facebook 维度/指标筛选与图表。
- **后端**：Vercel Serverless Functions（Node.js）+ Supabase / Postgres。
- **存储层**：Postgres（通过 Supabase 提供），以 **分层数据架构**（Staging → DWH → Marts/Views）组织。
- **对象存储**（可选）：原始上传文件存档（Supabase Storage）。

### 1.2 数据流
```
[Upload/Fetch]
  → Staging（fb_raw）
    → Clean/Normalize（fb_clean）
      → 事实&维度入库（DWH: fb_metrics_daily, fb_campaigns, ...）
        → 数据集市/物化视图（Marts: fb_weekly_mv, fb_funnel_mv）
          → 报表查询 API → 前端可视化
```

### 1.3 多站点/多渠道抽象
- **Site**：`site_id`（如 icyberite、poolsvacuum …）
- **Channel**：`channel_id`（如 `meta_ads` / `google_ads` / `tt_ads` …）
- **DataSource**：原始报表来源与模板版本（字段映射、日期粒度、货币等配置）

> 所有事实表均以 `site_id + channel_id` 作为分区键（或组合索引），实现物理/逻辑隔离与按站点/渠道查询优化。

---

## 2. 字段映射（基于示例 Facebook 报表）

> 示例工作表名：`Raw Data Report`

### 2.1 原始列 → 规范字段（核心）
| 原始列（示例） | 规范字段（建议） | 说明 |
|---|---|---|
| 广告系列名称 | campaign_name | 文本 |
| 广告组名称 | adset_name | 文本；可能为空（聚合到 campaign 层）|
| 投放层级 | level | `campaign`/`adset`/`ad` |
| 商品编号 | product_identifier | 可能含多个 SKU/ID，逗号分隔；需拆分映射 |
| 覆盖人数 | reach | 数值 |
| 展示次数 | impressions | 数值 |
| 频次 | frequency | 数值（=impressions/reach）|
| 链接点击量 | link_clicks | 数值 |
| 点击量（全部） | all_clicks | 数值（含各种点击）|
| 点击率（全部） | all_ctr | 比例（%）；建议存小数（0-1）|
| 链接点击率 | link_ctr | 比例（%）→小数 |
| 单次链接点击费用 | cpc_link | Spend / link_clicks |
| 已花费金额 (USD) | spend_usd | 货币（USD）|
| 加入购物车 | atc_total | 汇总口径（如有）|
| 网站加入购物车 | atc_web | Pixel（网站）|
| Meta 加入购物车 | atc_meta | In-App（ADV 里程）|
| 结账发起次数 | ic_total | 总口径 |
| 网站结账发起次数 | ic_web | 网站 |
| Meta 结账发起次数 | ic_meta | In-App |
| 网站购物 | purchase_web | 购买次数（网站）|
| Meta 内购物次数 | purchase_meta | 购买次数（In-App）|
| 开始日期/结束日期 | row_start_date / row_end_date | 行级数据的起止；优先使用粒度日期 |
| 报告开始日期/报告结束日期 | report_start / report_end | 整体报表范围 |
| 网址 / 链接（广告设置） | landing_url | 可能为空 |
| 图片名称 / 视频名称 | creative_name | 创意资源标识 |

### 2.2 推导/计算字段
- `cpm = spend_usd / impressions * 1000`
- `cpc_all = spend_usd / NULLIF(all_clicks,0)`
- `cpa_purchase_web = spend_usd / NULLIF(purchase_web,0)`
- `ctr_all = all_ctr（以小数存储）`，`ctr_link = link_ctr（小数）`
- 漏斗率：`visit→ATC→IC→Purchase`（分别针对 Web 与 Meta 两条链）
- ROAS（留空占位）：后续打通订单营收（如 Shopify/自建站）后补算 `revenue/spend`。

### 2.3 商品编号拆分
- `product_identifier` 可能形如：`"50176541589816, Xiaomi Smart AI Glasses | ..."`，需要：
  1) 正则抽取前置纯数字 ID；
  2) 余下文本作为 `product_title_guess`；
  3) 通过 `product_map` 表与站内 SKU/URL 做映射。

---

## 3. 数据库设计（Postgres / Supabase）

> 命名前缀建议：`meta_`（或统一用 `fb_`）。以下给出关键 DDL 原型，可直接执行或据此调整。

### 3.1 多租户与来源元数据
```sql
-- 站点
create table if not exists core_site (
  site_id       text primary key,
  domain        text not null,
  brand_name    text,
  created_at    timestamptz default now()
);

-- 渠道
create table if not exists core_channel (
  channel_id    text primary key,   -- e.g. 'meta_ads', 'google_ads'
  display_name  text not null
);

-- 数据源与模板版本（列名映射、币种、时区等）
create table if not exists core_datasource (
  datasource_id   uuid primary key default gen_random_uuid(),
  site_id         text references core_site(site_id) on delete cascade,
  channel_id      text references core_channel(channel_id),
  name            text,            -- 如："Meta Export v2025-08"
  currency        text default 'USD',
  timezone        text default 'UTC',
  mapping_json    jsonb not null,  -- 列名到标准字段的映射配置
  created_at      timestamptz default now()
);

-- 上传批次记录（幂等）
create table if not exists core_ingestion_batch (
  batch_id      uuid primary key default gen_random_uuid(),
  site_id       text references core_site(site_id),
  channel_id    text references core_channel(channel_id),
  datasource_id uuid references core_datasource(datasource_id),
  file_name     text,
  file_hash     text,  -- 去重
  report_start  date,
  report_end    date,
  row_count     int,
  created_at    timestamptz default now(),
  unique(file_hash)
);
```

### 3.2 广告实体维度
```sql
create table if not exists meta_campaign (
  campaign_id    text primary key,       -- 若报表无ID，仅名称，可用 hash(site+name)
  site_id        text references core_site(site_id),
  campaign_name  text,
  objective      text,
  status         text,
  created_at     timestamptz default now()
);

create table if not exists meta_adset (
  adset_id     text primary key,
  site_id      text references core_site(site_id),
  campaign_id  text references meta_campaign(campaign_id) on delete cascade,
  adset_name   text,
  status       text,
  created_at   timestamptz default now()
);

create table if not exists meta_ad (
  ad_id       text primary key,
  site_id     text references core_site(site_id),
  adset_id    text references meta_adset(adset_id) on delete cascade,
  ad_name     text,
  creative_name text,
  landing_url text,
  status      text,
  created_at  timestamptz default now()
);
```

> **说明**：若当前报表仅有名称而无 ID，可采用 `hash(site_id || level || name)` 生成稳定键，后续接入 Graph API 时再回填真实 ID。

### 3.3 商品维度与映射
```sql
create table if not exists dim_product (
  product_id    text primary key,      -- 站内商品ID或规范化ID
  site_id       text references core_site(site_id),
  product_title text,
  product_url   text,
  created_at    timestamptz default now()
);

create table if not exists map_product_meta (
  map_id        uuid primary key default gen_random_uuid(),
  site_id       text references core_site(site_id),
  raw_identifier text not null,       -- 报表里的“商品编号”解析出的元素
  product_id    text references dim_product(product_id),
  confidence    int default 100,
  unique(site_id, raw_identifier)
);
```

### 3.4 事实表（按日粒度）
```sql
create table if not exists fact_meta_daily (
  site_id       text references core_site(site_id),
  date          date not null,
  level         text,             -- campaign/adset/ad（与当前行聚合层一致）
  campaign_id   text,             -- 可为空（当level为campaign时填充）
  adset_id      text,
  ad_id         text,
  product_id    text,             -- 通过 mapping 解析到的站内ID；若未知可为空

  -- 指标（全部用数值/小数）
  reach         bigint default 0,
  impressions   bigint default 0,
  frequency     numeric(10,4),
  all_clicks    bigint default 0,
  link_clicks   bigint default 0,
  ctr_all       numeric(10,6),   -- 0-1
  ctr_link      numeric(10,6),
  spend_usd     numeric(18,6) default 0,
  cpm           numeric(18,6),
  cpc_all       numeric(18,6),
  cpc_link      numeric(18,6),

  atc_total     int default 0,
  atc_web       int default 0,
  atc_meta      int default 0,
  ic_total      int default 0,
  ic_web        int default 0,
  ic_meta       int default 0,
  purchase_web  int default 0,
  purchase_meta int default 0,

  batch_id      uuid references core_ingestion_batch(batch_id),
  primary key (site_id, date, level, campaign_id, adset_id, ad_id, product_id)
);

create index if not exists idx_fact_meta_daily_site_date on fact_meta_daily(site_id, date);
create index if not exists idx_fact_meta_daily_rollup on fact_meta_daily(site_id, level, campaign_id, adset_id);
```

### 3.5 周/月汇总（物化视图示例）
```sql
create materialized view if not exists mv_meta_weekly as
select
  site_id,
  date_trunc('week', date)::date as week_start,
  max(date) as week_end,
  level, campaign_id, adset_id, ad_id, product_id,
  sum(reach) as reach,
  sum(impressions) as impressions,
  sum(spend_usd) as spend_usd,
  sum(all_clicks) as all_clicks,
  sum(link_clicks) as link_clicks,
  sum(atc_web) as atc_web,
  sum(ic_web) as ic_web,
  sum(purchase_web) as purchase_web,
  -- 计算类指标
  (case when sum(impressions)>0 then sum(spend_usd)/sum(impressions)*1000 end) as cpm,
  (case when sum(link_clicks)>0 then sum(spend_usd)/sum(link_clicks) end) as cpc_link
from fact_meta_daily
group by 1,2,4,5,6,7,8;

create index if not exists idx_mv_meta_weekly on mv_meta_weekly(site_id, week_start);
```

---

## 4. 入库与清洗（ETL）

### 4.1 上传与解析
- **接口**：`POST /api/fb_ingest`（Vercel Serverless）
- **入参**：文件（xlsx/csv）+ `site_id` + `datasource_id`（可从 UI 选择）
- **步骤**：
  1) 计算文件 `hash`，若已存在则直接返回批次信息（幂等）；
  2) 解析表头并与 `core_datasource.mapping_json` 匹配；
  3) 行级拆分：
     - 按日期粒度切分（若报表按区间，平均/按比例拆分或记录到区间表，仅做周/月汇总时直接入汇总表——二选一，以**按日入库**为主）；
     - `product_identifier` 拆分为多行（每个映射一个 `product_id`）；
  4) 计算派生指标（cpm、cpc、ctr 等）；
  5) Upsert 至 `fact_meta_daily`（`primary key` 保证幂等）。

### 4.2 字段匹配策略（示例 mapping_json）
```json
{
  "campaign_name": ["广告系列名称"],
  "adset_name": ["广告组名称"],
  "level": ["投放层级"],
  "product_identifier": ["商品编号"],
  "reach": ["覆盖人数"],
  "impressions": ["展示次数"],
  "frequency": ["频次"],
  "link_clicks": ["链接点击量"],
  "all_clicks": ["点击量（全部）"],
  "ctr_all": ["点击率（全部）"],
  "ctr_link": ["链接点击率"],
  "spend_usd": ["已花费金额 (USD)"],
  "cpc_link": ["单次链接点击费用"],
  "atc_web": ["网站加入购物车"],
  "atc_meta": ["Meta 加入购物车"],
  "ic_web": ["网站结账发起次数"],
  "ic_meta": ["Meta 结账发起次数"],
  "purchase_web": ["网站购物"],
  "purchase_meta": ["Meta 内购物次数"],
  "report_start": ["报告开始日期"],
  "report_end": ["报告结束日期"]
}
```
- 若存在“加总口径”（如 `加入购物车`、`结账发起次数`）同时存在细分（Web/Meta），则优先以细分为准，总口径作为校验字段。

### 4.3 去重与校验
- **主键幂等**：`(site_id, date, level, campaign_id, adset_id, ad_id, product_id)`
- **非负校验**：展示、点击、费用、转化不得为负；异常行打入 `reject log`。
- **一致性**：
  - `frequency ≈ impressions/reach`（允许 ±5%）
  - `cpc_link ≈ spend/link_clicks`（允许 ±5%）
  - 如报表给出的 `ctr_all` 为百分比文本，转换为小数存储。

---

## 5. 报表与前端（复用 + 新组件）

### 5.1 页面导航
- 复用左侧导航结构（“独立站 → 数据分析”），新增 **Facebook** 标签页/筛选器。

### 5.2 KPI 卡（示例）
- `Spend`、`Impressions`、`Reach`、`CPM`、`CPC (Link)`、`ATC(Web)`、`IC(Web)`、`Purchase(Web)`
- 周对比（A/B）：当前周期 vs 前一周期（与现有对比机制一致）。

### 5.3 图表组件
- **漏斗**：`Link Clicks → ATC(Web) → IC(Web) → Purchase(Web)`；并列展示 Meta 路径。
- **趋势折线**：按日/周的 `Impressions/Spend/Link Clicks/ATC/Purchase`。
- **TopN**：按 `campaign/adset/ad` 或 `product` 排序的 Top10（支持跳转到商品页/广告详情）。
- **对比柱状**：本周 vs 上周（Spend、Impressions、Purchases）。

### 5.4 维度/筛选
- 日期（单选/区间/周/月）
- 聚合层级（Campaign / Adset / Ad）
- 商品（多选）
- 创意类型（图片/视频，若有）

### 5.5 API 合同（示例）
```http
GET /api/meta/periods               → { weeks: [...], months: [...] }
GET /api/meta/stats?gran=week&end=2025-08-24&site=icyberite
  → { ok:true, kpis:{...}, rows:[ {level, campaign_id, ... metrics ...} ] }
POST /api/fb_ingest  (multipart/form-data)
  → { ok:true, batch_id, rows, report_start, report_end }
```

---

## 6. 自动化上传：Google 与 Facebook 分开处理

> 目标：不同渠道有不同模板/字段/API，需拆分任务队列与执行器，互不影响。

### 6.1 任务表
```sql
create table if not exists job_upload (
  job_id       uuid primary key default gen_random_uuid(),
  site_id      text references core_site(site_id),
  channel_id   text references core_channel(channel_id),
  payload      jsonb not null,   -- 按渠道定义（文件路径/日期范围/模板ID等）
  status       text default 'pending',
  retries      int default 0,
  last_error   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_job_upload_status on job_upload(status, channel_id);
```

### 6.2 执行器（Serverless Cron / Edge）
- **Facebook**：生成渠道特定 CSV/XLSX（列名按 `mapping_json` 逆映射或按广告平台 API 要求组织），写入存储，触发上传（若走 Graph API）。
- **Google**：独立的打包与上传逻辑（例如 Google Ads SFTP/Cloud Storage/Sheets）。
- **重试**：指数退避；
- **幂等**：`(site_id, channel_id, date_range)` 唯一键避免重复上传。

---

## 7. 与 poolsvacuum.com 的复用与差异

### 7.1 可复用
- 前端框架/样式、通用 KPI 卡组件、A/B 周期对比逻辑、分页表格、ECharts 图表容器。
- 后端基础设施（Vercel + Supabase）、文件上传存储、批次记录表结构（可共用 `core_*`）。

### 7.2 差异点
- 维度与指标完全按 **Meta/Facebook** 标准；
- **双路径转化**（Web vs Meta In-App）并行展示与汇总；
- 商品编号解析与映射逻辑（报表中以“商品编号”复合字段出现）。

---

## 8. 安全与权限
- Supabase RLS（行级权限）：按 `site_id` 隔离；
- API 端进行 `site_id` 校验（来自登录态或请求头）；
- 上传文件仅站点管理员可访问；
- 审计：所有 `ingestion`、`job_upload` 操作记录审计日志（who/when/what）。

---

## 9. 里程碑与交付
1. **D1-D3**：建库（core + meta_* 表）、配置 `datasource.mapping_json`、完成 `/api/fb_ingest` 解析与入库；
2. **D4-D6**：前端 Facebook 页面（KPI/趋势/漏斗/TopN/明细）对接 `meta` 查询 API；
3. **D7-D9**：物化视图与周/月对比、商品映射 UI（半自动匹配 + 人工校正）；
4. **D10-D12**：自动化上传框架（`job_upload` + 执行器），分别实现 Google/Facebook 的最小可用上传任务；
5. **D13+**：打通站内订单营收（ROAS）、A/B 测试维度、跨站点统一看板。

---

## 10. 附录

### 10.1 示例查询（周汇总，按 Campaign）
```sql
select
  week_start, week_end,
  campaign_id,
  sum(spend_usd) as spend,
  sum(impressions) as imps,
  sum(link_clicks) as lclicks,
  sum(purchase_web) as orders_web,
  case when sum(impressions)>0 then sum(spend_usd)/sum(impressions)*1000 end as cpm,
  case when sum(link_clicks)>0 then sum(spend_usd)/sum(link_clicks) end as cpc
from mv_meta_weekly
where site_id = 'icyberite'
group by 1,2,3
order by week_start desc, spend desc;
```

### 10.2 伪代码：商品编号解析
```js
function parseProductIdentifiers(text){
  // 输入示例："50176541589816, Xiaomi Smart AI Glasses | ..."
  const items = String(text||'').split(',');
  const out = [];
  for (const it of items){
    const m = it.trim().match(/(\d{6,})/); // 连续6位以上数字视作ID
    const id = m ? m[1] : null;
    const title = it.replace(m?.[1]||'', '').trim().replace(/^[-|,]+/, '').trim();
    out.push({ raw: it.trim(), product_id_candidate: id, title_guess: title });
  }
  return out.filter(x=>x.raw);
}
```

### 10.3 Serverless 入库接口骨架
```ts
// POST /api/fb_ingest
export default async function handler(req, res){
  // 1) 解析上传文件 → 表头匹配 → 行级拆分
  // 2) 规范化/计算字段 → 批次记录 → upsert fact_meta_daily
  // 3) 返回 batch_id / 行数 / 时间范围
}
```

### 10.4 前端页面（差异点清单）
- 顶部筛选：`粒度(日/周/月)`、`层级(campaign/adset/ad)`、`商品`、`创意类型`；
- KPI：`Spend / Impressions / Reach / CPM / CPC(Link) / ATC(Web/Meta) / Purchase(Web/Meta)`；
- 漏斗：双路径（Web & Meta）并排；
- 明细表：可切换维度；点击跳转广告/商品页。

---

**备注**：当前版本未包含营收字段（ROAS），建议在后续里程碑接入站内订单（Shopify/自建站 DB）并完成订单-广告归因（UTM、Click ID、7/1/1 窗口）以完善闭环。

