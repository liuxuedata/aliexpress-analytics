# 站点配置框架部署指南（修复版）

## 问题修复

已修复 `site_configuration_framework.sql` 中的数据库错误：
- 为 `data_source_templates` 表添加了缺失的 `updated_at` 字段
- 为 `dynamic_tables` 表添加了缺失的 `updated_at` 字段
- 确保所有 `ON CONFLICT DO UPDATE SET` 子句正确引用 `updated_at` 字段

## 部署步骤

### 1. 执行修复脚本（如果之前执行过有问题的脚本）

如果你的数据库中已经存在这些表但缺少 `updated_at` 字段，请先执行：

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：fix_updated_at_columns.sql
```

这个脚本会安全地检查并添加缺失的字段，不会影响现有数据。

### 2. 执行完整的站点配置框架

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：site_configuration_framework.sql
```

这个脚本现在包含了正确的表结构定义，包括所有必要的 `updated_at` 字段。

### 3. 验证部署结果

执行完成后，你应该看到：
- 成功创建了 `site_configs`、`data_source_templates`、`dynamic_tables` 表
- 插入了预定义的 Facebook Ads 和 Google Ads 模板
- 插入了现有站点配置（A站、poolsvacuum.com、icyberite.com）
- 创建了 `generate_dynamic_table` 函数
- 生成了 `independent_icyberite_facebook_ads_daily` 表
- 设置了 RLS 策略和索引

### 4. 测试新功能

1. 访问 `/site-configuration.html` 页面
2. 测试站点配置管理功能
3. 测试数据上传功能（使用 Facebook Ads 或 Google Ads 模板）

## 现有自动化脚本集成

### Google Ads 自动上传（保持不变）

现有的 Google Apps Script 继续使用 `/api/independent/ingest` 端点，无需修改。

### Ozon 自动上传（保持不变）

现有的 Vercel Cron 任务继续使用原有端点，无需修改。

### Facebook Ads 自动上传（新增）

可以创建新的 Google Apps Script，调用 `/api/dynamic-ingest/independent_icyberite` 端点：

```javascript
// Facebook Ads 自动上传脚本示例
const CFG = {
  FOLDER_ID: 'your_facebook_reports_folder_id',
  REPORT_NAME_PREFIX: 'facebook_ads_report',
  API_URL: 'https://aliexpress-analytics.vercel.app/api/dynamic-ingest/independent_icyberite',
  INGEST_TOKEN: 'your_token'
};

function pushFacebookReportToVercel() {
  // 实现逻辑类似现有的 Google Ads 脚本
  // 但调用新的动态摄取端点
}
```

## 故障排除

### 如果遇到 "column updated_at does not exist" 错误

1. 先执行 `fix_updated_at_columns.sql`
2. 然后执行 `site_configuration_framework.sql`

### 如果遇到 "type numeric(10,2) does not exist" 或 "type integer does not exist" 错误

这个错误是由于动态表生成时数据类型名称包含引号导致的。请执行：

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：fix_data_type_quotes.sql
```

这个脚本会：
1. 删除可能存在的错误表
2. 重新创建修复版本的 `generate_dynamic_table` 函数（移除数据类型名称的引号）
3. 重新生成 Facebook Ads 数据表
4. 验证表创建结果

### 如果遇到 "relation dynamic_tables does not exist" 或 "column reference site_id is ambiguous" 错误

这个错误是由于表不存在或列引用不明确导致的。请执行：

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：fix_complete_framework.sql
```

这个脚本会：
1. 创建所有必要的基础表结构
2. 重新创建修复版本的 `generate_dynamic_table` 函数（使用明确的参数名）
3. 插入所有预定义的模板和站点配置
4. 重新生成 Facebook Ads 数据表
5. 设置 RLS 策略和索引
6. 验证所有结果

### 如果遇到 "there is no unique or exclusion constraint matching the ON CONFLICT specification" 错误

这个错误是由于 `dynamic_tables` 表缺少 `(site_id, table_name)` 的唯一约束导致的。请执行：

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：fix_unique_constraint.sql
```

这个脚本会：
1. 检查当前表约束
2. 添加缺失的唯一约束
3. 验证约束添加结果
4. 测试动态表生成函数
5. 验证最终结果

如果上述脚本仍然有问题，也可以尝试：

```sql
-- 在 Supabase SQL Editor 中执行
-- 文件：fix_dynamic_table_generation.sql
```

### 如果遇到其他错误

请检查：
1. 数据库连接是否正常
2. 是否有足够的权限创建表和函数
3. 表名是否与现有表冲突

## 下一步

部署完成后，你可以：
1. 使用站点配置页面添加新站点
2. 上传 Facebook Ads 数据到 icyberite.com 站点
3. 测试动态表生成功能
4. 根据需要调整数据源模板
