# 站点配置框架设计文档

## 概述

本框架支持快速添加新站点，自动生成相应的数据表格、页面框架和API接口，无需手动开发。

## 架构设计

### 1. 站点配置表结构

```sql
-- 站点基础信息
CREATE TABLE public.site_configs (
  id          text primary key,
  name        text not null,                    -- 站点名称（如：icyberite.com）
  platform    text not null,                    -- 平台类型
  display_name text not null,                   -- 显示名称
  domain      text,                             -- 域名
  data_source text not null,                    -- 数据源类型：google_ads, facebook_ads, etc.
  template_id text,                             -- 数据模板ID
  config_json jsonb,                            -- 配置信息（字段映射、API密钥等）
  is_active   boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 数据源模板
CREATE TABLE public.data_source_templates (
  id          text primary key,
  name        text not null,                    -- 模板名称（如：Facebook Ads v2025）
  platform    text not null,                    -- 适用平台
  source_type text not null,                    -- 数据源类型
  fields_json jsonb not null,                   -- 字段映射配置
  sample_file text,                             -- 示例文件路径
  created_at  timestamptz not null default now()
);

-- 动态数据表配置
CREATE TABLE public.dynamic_tables (
  id          text primary key,
  site_id     text references site_configs(id),
  table_name  text not null,                    -- 生成的表名
  table_schema jsonb not null,                  -- 表结构定义
  created_at  timestamptz not null default now()
);
```

### 2. 支持的平台类型

#### 平台站（Platform Sites）
- `ae_self_operated`: 速卖通自运营
- `ae_managed`: 速卖通全托管
- `amazon`: 亚马逊
- `ozon`: Ozon
- `tiktok`: TikTok Shop
- `temu`: Temu
- `lazada`: Lazada
- `shopee`: Shopee
- `ebay`: eBay

#### 独立站（Independent Sites）
- `independent`: 独立站
  - 数据源：`google_ads`, `facebook_ads`, `tiktok_ads`, `custom`

### 3. 数据源模板配置

#### Facebook Ads 模板
```json
{
  "id": "facebook_ads_v2025",
  "name": "Facebook Ads v2025",
  "platform": "independent",
  "source_type": "facebook_ads",
  "fields_json": {
    "mappings": {
      "广告系列名称": "campaign_name",
      "广告组名称": "adset_name",
      "投放层级": "level",
      "商品编号": "product_identifier",
      "覆盖人数": "reach",
      "展示次数": "impressions",
      "频次": "frequency",
      "链接点击量": "link_clicks",
      "点击量（全部）": "all_clicks",
      "点击率（全部）": "all_ctr",
      "链接点击率": "link_ctr",
      "单次链接点击费用": "cpc_link",
      "已花费金额 (USD)": "spend_usd",
      "加入购物车": "atc_total",
      "网站加入购物车": "atc_web",
      "Meta 加入购物车": "atc_meta",
      "结账发起次数": "ic_total",
      "网站结账发起次数": "ic_web",
      "Meta 结账发起次数": "ic_meta",
      "网站购物": "purchase_web",
      "Meta 内购物次数": "purchase_meta",
      "开始日期": "row_start_date",
      "结束日期": "row_end_date",
      "网址": "landing_url",
      "图片名称": "creative_name"
    },
    "calculated_fields": {
      "cpm": "spend_usd / impressions * 1000",
      "cpc_all": "spend_usd / NULLIF(all_clicks,0)",
      "cpa_purchase_web": "spend_usd / NULLIF(purchase_web,0)",
      "ctr_all": "all_ctr",
      "ctr_link": "link_ctr"
    },
    "required_fields": ["campaign_name", "impressions", "spend_usd"],
    "date_fields": ["row_start_date", "row_end_date"],
    "numeric_fields": ["reach", "impressions", "link_clicks", "spend_usd"]
  }
}
```

#### Google Ads 模板
```json
{
  "id": "google_ads_landing_pages",
  "name": "Google Ads Landing Pages",
  "platform": "independent",
  "source_type": "google_ads",
  "fields_json": {
    "mappings": {
      "Landing page": "landing_url",
      "Campaign": "campaign",
      "Day": "day",
      "Network (with search partners)": "network",
      "Device": "device",
      "Clicks": "clicks",
      "Impr.": "impr",
      "CTR": "ctr",
      "Avg. CPC": "avg_cpc",
      "Cost": "cost",
      "Conversions": "conversions",
      "Cost / conv.": "cost_per_conv"
    },
    "required_fields": ["landing_url", "campaign", "day"],
    "date_fields": ["day"],
    "numeric_fields": ["clicks", "impr", "cost", "conversions"]
  }
}
```

### 4. 自动生成机制

#### 4.1 数据表生成
- 根据模板配置自动创建数据表
- 表名格式：`{site_id}_{source_type}_daily`
- 自动添加索引和约束

#### 4.2 API接口生成
- 自动生成数据上传接口：`/api/{site_id}/ingest`
- 自动生成数据查询接口：`/api/{site_id}/stats`
- 自动生成搜索接口：`/api/{site_id}/search`

#### 4.3 页面框架生成
- 自动生成站点管理页面
- 自动生成数据上传页面
- 自动生成数据展示页面

### 5. 使用流程

#### 5.1 添加新站点
1. 访问 `/admin.html`（或保留的 `/site-management.html` 快捷入口）选择平台和数据源
2. 上传数据模板文件
3. 系统自动生成配置
4. 自动创建数据表和API接口
5. 自动生成页面框架

#### 5.2 数据上传
1. 选择站点和数据源
2. 上传符合模板的Excel/CSV文件
3. 系统自动解析和清洗数据
4. 数据入库并生成报表

#### 5.3 数据展示
1. 选择站点和时间范围
2. 系统自动加载对应数据
3. 生成图表和报表

## 实施计划

### 阶段1：基础框架
- [ ] 创建站点配置表
- [ ] 创建数据源模板表
- [ ] 实现基础API接口

### 阶段2：模板系统
- [ ] 实现Facebook Ads模板
- [ ] 实现Google Ads模板
- [ ] 实现模板验证机制

### 阶段3：自动生成
- [ ] 实现数据表自动生成
- [ ] 实现API接口自动生成
- [ ] 实现页面框架自动生成

### 阶段4：测试和优化
- [ ] 测试icyberite.com站点
- [ ] 测试poolsvacuum.com站点
- [ ] 性能优化和错误处理
