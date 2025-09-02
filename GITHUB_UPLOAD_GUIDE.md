# GitHub 分支同步指南

## 创建新分支
1. 访问：https://github.com/您的用户名/aliexpress-analytics
2. 点击 "main" 分支下拉菜单
3. 点击 "New branch"
4. 分支名称：`multi-site-feature`
5. 点击 "Create branch"

## 需要上传的文件清单

### 1. 数据库迁移文件
- `migration_smart_add_site_field.sql` - 智能迁移脚本
- `simple_fix_sites.sql` - 简化修复脚本
- `fix_sites_table.sql` - 站点表修复脚本
- `supabase_schema_new.sql` - 新环境部署脚本
- `MIGRATION_GUIDE.md` - 迁移指南

### 2. API 接口文件
- `api/sites/index.js` - 站点管理 API (新增)
- `api/ae_self_operated/stats/index.js` - 速卖通自运营统计 API (新增)
- `api/ae_query/index.js` - 查询 API (已修改支持多站点)
- `api/self_operated_api.js` - 自运营 API (已修改支持多站点)

### 3. 前端页面文件
- `public/site-management.html` - 站点管理页面 (新增)
- `public/self-operated.html` - 自运营页面 (已修改)
- `public/test-multi-site.html` - 多站点功能测试页面 (新增)
- `public/test-fix.html` - API 修复测试页面 (新增)
- `public/test_api.html` - API 测试页面 (新增)

### 4. 文档文件
- `README_NEW_KPI_EMBEDDED.md` - 功能说明文档

## 上传步骤

### 方法一：GitHub 网页上传
1. 在新分支中，点击 "Add file" → "Upload files"
2. 将上述文件拖拽到上传区域
3. 添加提交信息：`feat: 添加多站点扩展功能`
4. 点击 "Commit changes"

### 方法二：逐个文件上传
1. 点击 "Add file" → "Create new file"
2. 文件名：输入完整路径，如 `api/sites/index.js`
3. 复制文件内容到编辑器中
4. 添加提交信息
5. 点击 "Commit new file"
6. 重复上述步骤上传所有文件

## 测试部署

### 1. Vercel 部署
1. 访问：https://vercel.com
2. 导入 GitHub 仓库
3. 选择 `multi-site-feature` 分支
4. 部署项目

### 2. 数据库迁移
1. 访问 Supabase Dashboard
2. 进入 SQL Editor
3. 按顺序执行：
   - `fix_sites_table.sql`
   - `migration_smart_add_site_field.sql`

### 3. 功能测试
1. 访问部署后的网站
2. 测试页面：
   - `/test-multi-site.html` - 多站点功能测试
   - `/test-fix.html` - API 修复测试
   - `/site-management.html` - 站点管理
   - `/self-operated.html` - 自运营页面

## 提交信息模板

```
feat: 添加多站点扩展功能

- 新增站点管理 API (/api/sites)
- 新增速卖通自运营统计 API (/api/ae_self_operated/stats)
- 更新查询 API 支持多站点过滤
- 新增站点管理页面
- 更新自运营页面支持站点切换
- 添加数据库迁移脚本
- 添加功能测试页面

数据库变更：
- 添加 site 字段到 ae_self_operated_daily 表
- 创建 sites 表管理站点信息
- 更新主键和索引
- 设置 RLS 策略
```

## 回滚方案

如果需要回滚：
1. 在 GitHub 中切换到 `main` 分支
2. 删除 `multi-site-feature` 分支
3. 在 Supabase 中执行回滚 SQL（如果需要）

## 注意事项

1. **数据库迁移**：请先在测试环境执行迁移脚本
2. **API 测试**：确保所有 API 接口正常工作
3. **前端兼容**：确保现有功能不受影响
4. **数据备份**：迁移前请备份重要数据
