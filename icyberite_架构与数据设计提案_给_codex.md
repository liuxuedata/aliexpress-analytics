# ICYBERITE（icyberite.com）——独立站统计平台：网站与数据库架构设计提案

> 目标：在现有统计平台中新增 **icyberite.com** 站点，UI 与导航风格参考/复用 **poolsvacuum.com** 的“独立站”模块，但 **投放渠道以 Facebook 为主**；数据输入结构与 poolsvacuum 不同，需新建一套表结构与上传/查询 API。设计需 **面向多站点与多渠道可扩展**（后续还会有其它独立站，且存在 Google / Facebook 不同报表格式与上传流程）。

---

## 1. 总体架构

### 1.1 关键目标
- **多租户/多站点**：统一平台内可挂载多个独立站（icyberite、poolsvacuum、…），每个站点的投放渠道、数据结构可差异化。
- **多渠道**：至少覆盖 Facebook（Ads + Pixel）与 Google（Ads/GA4/GMC），**分开处理**上传与清洗管道，但在“公共指标层”统一对齐，便于跨渠道对比。
- **安全与稳定**：幂等入库（唯一键去重）、断点续传、字段校验与失败日志。
- **兼容 UI 与主题**：沿用现有主题与导航；新增 icyberite 的子导航与页面，复用 ECharts + DataTables 组件。

### 1.2 目录规划（建议）
```
/public
  /assets/                # 复用统一主题CSS/JS（theme_unified_*.css 等）
  /icyberite/
    index.html            # 总览（Facebook为主）
    detail.html           # 明细（可合并在 index.html 的 Tab）
    readme.md             # 页面说明（可选）

/api
  /icyberite/
    fb_ingest_ads.js      # Facebook Ads 日级指标入库（CSV/JSON通道）
    fb_ingest_pixel.js    # Facebook Pixel 日级事件入库（CSV/JSON）
    stats.js              # 公共查询：按站点/渠道/时间/粒度聚合
    periods.js            # 可选：返回可选周期（周/月末/自然日范围）

/db
  /migrations/            # SQL 迁移文件（Supabase/PG）
  icyberite_schema.sql    # 本提案附示例DDL
```

---

## 2. 数据层设计（Postgres / Supabase）

> 原则：**维度归维度、事实归事实**；每日粒度（可按周/月再聚合）；**site + channel** 作为最小归属；Facebook 与 Google 的差异通过 **事实表拆分** + **统一视图** 对齐。

### 2.1 维度表
```sql
-- 站点
create table if not exists dim_site (
  site_id      bigserial primary key,
  domain       text unique not null,         -- 例如 icyberite.com
  brand_name   text,                         -- 例如 ICYBERITE
  created_at   timestamptz not null default now(),
  is_active    boolean not null default true
);

-- 渠道（固定集合：facebook / google / others）
create table if not exists dim_channel (
  channel_id   bigserial primary key,
  name         text unique not null          -- 'facebook' | 'google' | ...
);

-- 广告对象（通用维度，外键关联 site + channel，可承载FB/Google）
create table if not exists dim_campaign (
  id           bigserial primary key,
  site_id      bigint not null references dim_site(site_id),
  channel_id   bigint not null references dim_channel(channel_id),
  ext_id       text not null,                -- 平台侧 campaign_id（如 FB）
  name         text,
  objective    text,
  meta         jsonb default '{}'::jsonb,
  unique(site_id, channel_id, ext_id)
);

create table if not exists dim_adset (
  id           bigserial primary key,
  campaign_id  bigint not null references dim_campaign(id),
  ext_id       text not null,                -- 平台侧 adset_id
  name         text,
  optimization_event text,
  bid_strategy text,
  targeting    jsonb default '{}'::jsonb,
  unique(campaign_id, ext_id)
);

create table if not exists dim_ad (
  id           bigserial primary key,
  adset_id     bigint not null references dim_adset(id),
  ext_id       text not null,                -- 平台侧 ad_id
  name         text,
  creative     jsonb default '{}'::jsonb,    -- 素材信息（缩略图、格式、文案等）
  unique(adset_id, ext_id)
);

-- 商品（独立站公共维度）
create table if not exists dim_product (
  product_pk   bigserial primary key,
  site_id      bigint not null references dim_site(site_id),
  product_id   text not null,                -- 站内商品ID或Handle/SKU
  name         text,
  url          text,
  attrs        jsonb default '{}'::jsonb,
  unique(site_id, product_id)
);
```

### 2.2 事实表 —— Facebook Ads（广告投放指标，日级）
```sql
create table if not exists fact_fb_ads_daily (
  den             date not null,             -- 统计日期（按站点时区日结，默认 Asia/Singapore）
  site_id         bigint not null references dim_site(site_id),
  campaign_id     bigint not null references dim_campaign(id),
  adset_id        bigint not null references dim_adset(id),
  ad_id           bigint not null references dim_ad(id),
  -- 基础投放指标
  impressions     bigint default 0,
  reach           bigint default 0,
  clicks          bigint default 0,
  spend           numeric(14,2) default 0,
  cpm             numeric(12,4),
  cpc             numeric(12,4),
  ctr             numeric(12,4),
  -- 转化相关（若从 Ads Insights 的 actions/standard_events 解包）
  view_content    bigint default 0,
  add_to_cart     bigint default 0,
  initiate_checkout bigint default 0,
  purchases       bigint default 0,
  purchase_value  numeric(14,2) default 0,  -- ROAS 需要 value
  currency        text default 'USD',
  -- 归因窗口/模型（可选）
  attribution     text,                      -- e.g. "7d_click_1d_view"
  inserted_at     timestamptz not null default now(),
  unique(den, ad_id)                         -- 幂等入库：同一 ad + 日唯一
);
```

### 2.3 事实表 —— Facebook Pixel（站内事件，日级汇总）
```sql
create table if not exists fact_fb_pixel_daily (
  den             date not null,
  site_id         bigint not null references dim_site(site_id),
  event_name      text not null,             -- page_view / view_content / add_to_cart / initiate_checkout / purchase
  event_count     bigint default 0,
  value_sum       numeric(14,2) default 0,
  currency        text default 'USD',
  -- UTM/归因（方便与广告维度join）
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  -- 商品关联（若携带 content_ids / content_name）
  product_id      text,
  product_qty     numeric(14,3),
  inserted_at     timestamptz not null default now(),
  unique(den, site_id, event_name, coalesce(utm_campaign,''), coalesce(utm_content,''), coalesce(product_id,''))
);
```

### 2.4 事实表 —— 站点通用流量（可供 Google/其他来源复用，日级）
```sql
create table if not exists fact_site_traffic_daily (
  den             date not null,
  site_id         bigint not null references dim_site(site_id),
  sessions        bigint default 0,
  users           bigint default 0,
  pageviews       bigint default 0,
  engaged_sessions bigint default 0,
  conversions     bigint default 0,
  revenue         numeric(14,2) default 0,
  currency        text default 'USD',
  source          text,                       -- ga / server_logs / etc.
  inserted_at     timestamptz not null default now(),
  unique(den, site_id, coalesce(source,''))
);
```

### 2.5 统一公共视图（跨渠道对齐的“评估层”）
```sql
create view v_marketing_daily as
select
  f.den,
  s.domain as site,
  'facebook'::text as channel,
  -- 基本曝光点击花费
  f.impressions, f.clicks, f.spend,
  -- 漏斗（ads侧）
  f.view_content, f.add_to_cart, f.initiate_checkout, f.purchases, f.purchase_value,
  -- 常用KPI
  case when f.impressions>0 then round(100.0*f.clicks/f.impressions, 4) end as ctr,
  case when f.clicks>0 then round(f.spend/f.clicks, 4) end as cpc,
  case when f.impressions>0 then round(1000.0*f.spend/f.impressions, 4) end as cpm,
  case when f.spend>0 then round(f.purchase_value/f.spend, 4) end as roas
from fact_fb_ads_daily f
join dim_site s on s.site_id = f.site_id;
```
> 备注：Google 侧也可有对应事实表 + 视图，同名字段尽量对齐，便于前端统一渲染。

---

## 3. 数据接入与上传（Facebook 与 Google **分别处理**）

### 3.1 Facebook Ads（两条通道）
- **CSV/手动上传**：从 Facebook Ads Manager 导出（按日）→ 前端上传 → `/api/icyberite/fb_ingest_ads.js` 清洗入库。
- **API/自动拉取**（二期）：Server 定时任务（CRON）调用 **Marketing API**，以 ad-level 日报粒度拉取，写入同表。

**建议 CSV 标准列（可兼容多表头）**
```
Date, Account ID, Campaign ID, Campaign Name, Ad Set ID, Ad Set Name,
Ad ID, Ad Name, Impressions, Reach, Clicks, Spend, CTR, CPC, CPM,
ViewContent, AddToCart, InitiateCheckout, Purchases, PurchaseValue, Currency,
Attribution
```
> actions/standard_events 解包映射表在 `fb_ingest_ads.js` 内实现；缺列按 0 处理。

### 3.2 Facebook Pixel（两条通道）
- **CSV/手动上传**：从像素事件导出 或 埋点转储（含 UTM、value、content_ids）→ `/api/icyberite/fb_ingest_pixel.js`。
- **API/自动拉取**（二期）：Graph API（Events）或由埋点服务按天聚合推送。

**建议 CSV 标准列**
```
Date, EventName, EventCount, ValueSum, Currency,
UTM Source, UTM Medium, UTM Campaign, UTM Content, UTM Term,
ProductID, ProductQty
```

### 3.3 Google（供其它站/未来使用）
- **与 Facebook 严格分流**：Google 数据（Ads/GA4/GMC）走独立 ingest，落到 `fact_site_traffic_daily` 或对应 Google Ads 事实表（如需）。
- **CSV/API 皆可**，键值与去重策略与 FB 一致；公共视图层对齐字段：impressions, clicks, spend, purchases, revenue/values, ctr/cpc/cpm/roas。

### 3.4 幂等与校验
- 入库前统一 `date + 唯一键`（如 `ad_id`）做去重。
- 校验日期必须为 **已完结日**（以 Asia/Singapore TZ 计算）。
- 对金额/数值型字段做 `toNumber`；空值置 0；异常行写入 `ingest_errors`（可选）。

---

## 4. API 设计（Vercel Node）

### 4.1 环境变量
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DEFAULT_TZ=Asia/Singapore
SITE_DOMAIN_ICYBERITE=icyberite.com
CHANNEL_FB=facebook
#（二期）Facebook App & Token：
FB_APP_ID=
FB_APP_SECRET=
FB_AD_ACCOUNT_ID=
FB_ACCESS_TOKEN=
```

### 4.2 入库端点（示例）
**`/api/icyberite/fb_ingest_ads.js`**（支持 `Content-Type: application/json`，body 为 rows[] 或 {rows:[]}；也可以 FormData+CSV 解析）
```js
// 伪代码骨架：
import { createClient } from '@supabase/supabase-js';
export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ok:false,msg:'POST only'});
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
  const body = typeof req.body==='string'? JSON.parse(req.body): req.body;
  const rowsIn = Array.isArray(body)? body: (body?.rows||[]);
  // 1) 归一化 + 维度落盘（site/channel/campaign/adset/ad）
  // 2) 映射 actions → view_content/add_to_cart/... 为空则 0
  // 3) 批量 upsert fact_fb_ads_daily（unique: den+ad_id）
  return res.json({ok:true, upserted: n});
}
```

**`/api/icyberite/fb_ingest_pixel.js`**：同上，写入 `fact_fb_pixel_daily`（unique: den+site_id+event_name+utm+product_id）。

### 4.3 查询端点
- `GET /api/icyberite/stats?start=YYYY-MM-DD&end=YYYY-MM-DD&gran=day|week|month&group=campaign|adset|ad`
  - 返回聚合字段：impressions, clicks, spend, ctr, cpc, cpm, view_content, add_to_cart, initiate_checkout, purchases, purchase_value, roas。
- `GET /api/icyberite/periods`：返回最近 N 个“周末/月底/自然日”以供下拉。

> SQL 端可用 `date_trunc('week'|'month', den)` 做聚合；或在查询层转。

---

## 5. 前端页面（复用现有风格与组件）

### 5.1 导航与路由
- 在左侧 **独立站** 菜单下新增：`ICYBERITE（Facebook）`。
- 入口：`/icyberite/index.html`（或单页多 Tab）。
- vercel.json 路由无需特殊改动（public 下的静态文件即可访问）。

### 5.2 页面结构（单页多 Tab 建议）
- 顶部：站点选择（预留）、日期范围、粒度（天/周/月）、渠道（默认 Facebook）。
- KPI 卡：Spend、Impressions、Clicks、CTR、CPC、CPM、Purchases、Revenue、ROAS、Pixel Funnel（PV→VC→ATC→CHK→PUR）。
- 图表（ECharts）：
  1) **双周期对比**（支出/点击/转化随时间）；
  2) **漏斗**（Ads vs Pixel 对照）；
  3) **Top Creatives / Top Campaigns**（可切换维度，按 ROAS/CTR/CVR 排序）。
- 明细表（DataTables）：按 `group=ad|adset|campaign` 展开，含外链到素材或落地页。
- 主题：复用统一浅色内容 + 深色侧栏（现有 `theme_unified_0811b.css`）。

### 5.3 字段口径（前端计算优先从后端返回）
- `CTR = clicks / impressions`
- `CPC = spend / clicks`
- `CPM = spend / impressions * 1000`
- `CVR(atc→pur) = purchases / add_to_cart`
- `ROAS = purchase_value / spend`

---

## 6. 与 poolsvacuum 的差异与复用
- **复用**：导航骨架、主题、KPI 卡样式、日期/粒度选择、图表组件、明细表组件。
- **差异**：
  - 数据源从 **AliExpress/Google** → **Facebook Ads + Pixel**；
  - 事实表命名与字段不同；
  - 上传端点不同且**分开处理**（`/icyberite/fb_*`）。

---

## 7. 迁移与上线步骤
1) 执行 `/db/icyberite_schema.sql` 迁移（或拆分 migrations）。
2) 在 `dim_site` 插入 `icyberite.com`；在 `dim_channel` 确保有 `facebook`。
3) 上线 `/api/icyberite/fb_ingest_ads.js` 与 `/api/icyberite/fb_ingest_pixel.js`（先仅 JSON/CSV 手动上传）。
4) 开发 `/api/icyberite/stats.js` 与 `periods.js`（复用现有查询模式）。
5) 开发 `/public/icyberite/index.html`（复用 DataTables + ECharts 结构，参考 poolsvacuum 的独立站页面）。
6) 回归测试：
   - 去重/幂等：多次上传相同数据结果一致；
   - 时区：以 Asia/Singapore 结算；
   - KPI 与图表指标口径复核。

---

## 8. 后续路线（二期）
- **自动化抓取**：CRON 拉取 FB Marketing API / Pixel API（长期 token、轮询补数）。
- **统一比对视图**：Ads 与 Pixel 同期对齐（归因拉齐/去重）；商品维度透视（dim_product join）。
- **跨渠道仪表盘**：支持在一个页面切换 Facebook / Google，KPI 保持同口径展示。
- **告警**：成本/CTR/ROAS 阈值波动告警（邮件/企业微信/Slack）。

---

## 9. 附：最小可行 DDL（整合）
> 可直接保存为 `/db/icyberite_schema.sql`，运行前保证 schema/权限与 Supabase 兼容。
```sql
-- === 基础维度 ===
insert into dim_channel(name) values ('facebook') on conflict do nothing;

-- === 站点初始化（上线时执行一次） ===
insert into dim_site(domain, brand_name) values ('icyberite.com', 'ICYBERITE')
  on conflict(domain) do nothing;

-- === 上文 2.1 ~ 2.4 的表定义请逐条执行 ===
```

---

## 10. 验收清单（Dev Ready）
- [ ] `dim_site` 中存在 `icyberite.com`
- [ ] 两个 ingest API 可接收 JSON/CSV 并幂等入库
- [ ] `stats` 查询按日/周/月聚合正确，返回统一口径 KPI
- [ ] 前端页 `/icyberite/index.html` 可：
  - [ ] 日期切换、粒度切换
  - [ ] KPI 卡正确
  - [ ] 双周期对比图与漏斗图
  - [ ] 明细表可切换 Campaign/Adset/Ad 粒度
- [ ] 文档：CSV 模板与字段映射说明（放置 /public/icyberite/readme.md）

---

> 若需，我可以在本仓内直接补齐 **API 骨架文件** 与 **前端页面模板**（按上述路径），并提供一个最小可用的 CSV 示例（10 行）用于自测上传。

