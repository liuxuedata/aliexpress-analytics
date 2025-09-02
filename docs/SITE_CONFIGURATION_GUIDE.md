# 站点配置框架使用指南

## 概述

本指南介绍如何使用站点配置框架快速添加新站点，自动生成数据表和API接口。

## 快速开始

### 1. 访问配置页面

访问 `/site-configuration.html` 进入高级站点配置页面。

### 2. 添加新站点

#### 2.1 基本信息配置
- **站点名称**: 输入站点标识（如：icyberite.com）
- **平台类型**: 选择平台（独立站、速卖通自运营等）
- **显示名称**: 输入显示名称（如：独立站 icyberite.com）
- **域名**: 可选，输入站点域名

#### 2.2 数据源配置
- **数据源类型**: 选择数据源（Facebook Ads、Google Ads等）
- **数据模板**: 系统会自动选择匹配的模板

#### 2.3 高级配置
- **配置信息**: 可输入JSON格式的额外配置（API密钥等）

### 3. 自动生成功能

创建站点后，系统会自动：
- 生成对应的数据表
- 创建数据上传API接口
- 创建数据查询API接口

## 支持的平台和数据源

### 平台站
- **速卖通自运营**: 使用速卖通API数据
- **速卖通全托管**: 使用速卖通API数据
- **亚马逊**: 支持自定义数据源
- **eBay**: 支持自定义数据源

### 独立站
- **Google Ads**: 支持Landing Pages报表
- **Facebook Ads**: 支持广告系列报表
- **TikTok Ads**: 支持自定义数据源
- **自定义**: 支持任意Excel/CSV格式

## 数据模板说明

### Facebook Ads 模板

#### 支持的字段
- 广告系列名称 → campaign_name
- 广告组名称 → adset_name
- 投放层级 → level
- 商品编号 → product_identifier
- 覆盖人数 → reach
- 展示次数 → impressions
- 频次 → frequency
- 链接点击量 → link_clicks
- 点击量（全部） → all_clicks
- 点击率（全部） → all_ctr
- 链接点击率 → link_ctr
- 单次链接点击费用 → cpc_link
- 已花费金额 (USD) → spend_usd
- 加入购物车 → atc_total
- 网站加入购物车 → atc_web
- Meta 加入购物车 → atc_meta
- 结账发起次数 → ic_total
- 网站结账发起次数 → ic_web
- Meta 结账发起次数 → ic_meta
- 网站购物 → purchase_web
- Meta 内购物次数 → purchase_meta
- 开始日期 → row_start_date
- 结束日期 → row_end_date
- 网址 → landing_url
- 图片名称 → creative_name

#### 自动计算的字段
- CPM = spend_usd / impressions * 1000
- CPC (全部) = spend_usd / all_clicks
- CPA (网站购买) = spend_usd / purchase_web

### Google Ads 模板

#### 支持的字段
- Landing page → landing_url
- Campaign → campaign
- Day → day
- Network (with search partners) → network
- Device → device
- Clicks → clicks
- Impr. → impr
- CTR → ctr
- Avg. CPC → avg_cpc
- Cost → cost
- Conversions → conversions
- Cost / conv. → cost_per_conv

## 数据上传

### 1. 准备数据文件

确保你的Excel/CSV文件包含必要的字段：
- Facebook Ads: 至少包含"广告系列名称"、"展示次数"、"已花费金额"
- Google Ads: 至少包含"Landing page"、"Campaign"、"Day"

### 2. 上传数据

1. 在配置页面选择要上传数据的站点
2. 拖拽或选择数据文件
3. 点击"测试数据上传"
4. 查看上传结果

### 3. 数据验证

系统会自动：
- 验证文件格式
- 检查必要字段
- 转换数据类型
- 计算派生字段
- 去重处理

## API接口

### 数据上传接口
```
POST /api/dynamic-ingest/{siteId}
Content-Type: multipart/form-data

参数:
- file: 数据文件 (Excel/CSV)
```

### 站点配置接口
```
GET /api/site-configs
获取所有站点配置

POST /api/site-configs
创建新站点配置

DELETE /api/site-configs/{siteId}
删除站点配置
```

### 数据源模板接口
```
GET /api/data-source-templates
获取所有数据源模板

POST /api/data-source-templates
创建新数据源模板
```

## 数据库结构

### 站点配置表 (site_configs)
```sql
CREATE TABLE site_configs (
  id          text primary key,
  name        text not null,
  platform    text not null,
  display_name text not null,
  domain      text,
  data_source text not null,
  template_id text,
  config_json jsonb,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

### 数据源模板表 (data_source_templates)
```sql
CREATE TABLE data_source_templates (
  id          text primary key,
  name        text not null,
  platform    text not null,
  source_type text not null,
  fields_json jsonb not null,
  sample_file text,
  created_at  timestamptz default now()
);
```

### 动态数据表
每个站点会自动生成对应的数据表：
- 表名格式: `{siteId}_{dataSource}_daily`
- 例如: `independent_icyberite_facebook_ads_daily`

## 使用示例

### 添加 icyberite.com 站点

1. **基本信息**
   - 站点名称: icyberite.com
   - 平台类型: 独立站
   - 显示名称: 独立站 icyberite.com
   - 域名: icyberite.com

2. **数据源配置**
   - 数据源类型: Facebook Ads
   - 数据模板: Facebook Ads v2025

3. **创建站点**
   - 点击"创建站点"
   - 系统自动生成数据表: `independent_icyberite_facebook_ads_daily`

4. **上传数据**
   - 选择站点: independent_icyberite
   - 上传Facebook Ads报表文件
   - 系统自动解析和入库

### 添加新的数据源模板

如果需要支持新的数据源格式：

1. **创建模板**
   ```json
   {
     "id": "custom_template_v1",
     "name": "自定义模板 v1",
     "platform": "independent",
     "source_type": "custom",
     "fields_json": {
       "mappings": {
         "字段1": "field1",
         "字段2": "field2"
       },
       "required_fields": ["field1"],
       "date_fields": ["field2"],
       "numeric_fields": ["field1"]
     }
   }
   ```

2. **调用API**
   ```bash
   curl -X POST /api/data-source-templates \
     -H "Content-Type: application/json" \
     -d '{"id":"custom_template_v1",...}'
   ```

## 故障排除

### 常见问题

1. **文件上传失败**
   - 检查文件格式是否为Excel或CSV
   - 确认文件包含必要的字段
   - 检查文件大小是否超限

2. **数据解析错误**
   - 检查字段名称是否匹配模板
   - 确认日期格式是否正确
   - 验证数值字段格式

3. **数据库错误**
   - 检查表是否已创建
   - 确认字段类型是否匹配
   - 验证主键约束

### 调试方法

1. **查看API响应**
   - 检查返回的错误信息
   - 查看处理的数据条数

2. **检查数据库**
   ```sql
   -- 查看站点配置
   SELECT * FROM site_configs WHERE id = 'your_site_id';
   
   -- 查看生成的数据表
   SELECT * FROM your_site_table LIMIT 10;
   ```

3. **查看日志**
   - 检查Vercel函数日志
   - 查看Supabase查询日志

## 最佳实践

1. **命名规范**
   - 站点名称使用小写字母和下划线
   - 避免特殊字符和空格

2. **数据准备**
   - 确保数据文件格式一致
   - 清理无效数据和空行
   - 统一日期格式

3. **模板设计**
   - 明确定义字段映射
   - 设置必要字段验证
   - 考虑数据类型转换

4. **性能优化**
   - 分批上传大量数据
   - 定期清理临时文件
   - 监控数据库性能

## 扩展功能

### 自定义数据处理

可以通过修改API代码来支持：
- 自定义字段映射
- 复杂的数据转换
- 多文件合并
- 数据验证规则

### 自动化集成

可以集成：
- 定时数据同步
- 邮件通知
- 数据质量监控
- 报表自动生成

## 联系支持

如果遇到问题，请：
1. 查看本文档的故障排除部分
2. 检查API响应和错误日志
3. 联系技术支持团队
