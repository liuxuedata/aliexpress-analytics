# Phase 2 部署指南

## 📋 部署概述

本指南将帮助您部署跨境电商管理平台的 Phase 2 扩展功能，包括订单管理、库存管理、广告管理和用户权限系统。

## 🚀 部署步骤

### 1. 环境准备

#### 1.1 检查现有环境
确保您已经部署了基础平台，包括：
- ✅ Vercel 项目已创建
- ✅ Supabase 数据库已配置
- ✅ 环境变量已设置

#### 1.2 环境变量
确保以下环境变量已正确配置：
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. 数据库迁移

#### 2.1 执行迁移脚本
在 Supabase SQL 编辑器中执行以下迁移脚本：

```sql
-- 执行 migrations/001_create_management_tables.sql
-- 该脚本将创建所有 Phase 2 所需的表结构
-- 注意：此脚本已修复 PostgreSQL 语法错误
```

**重要修复说明**:
- 原脚本中的 `UNIQUE (COALESCE(site_id, platform), module_key)` 语法错误已修复
- 使用唯一索引替代 UNIQUE 约束：`CREATE UNIQUE INDEX ... ON (COALESCE(site_id, ''), platform, module_key)`
- 保持了数据完整性和业务逻辑不变

#### 2.2 验证表创建
执行以下查询验证表是否创建成功：
```sql
-- 检查核心表
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'roles', 'products', 'inventory', 'orders', 'ad_campaigns', 'site_module_configs');

-- 检查默认数据
SELECT COUNT(*) FROM roles;
SELECT COUNT(*) FROM site_module_configs;
```

### 3. 代码部署

#### 3.1 上传新文件
将以下新文件上传到 Vercel 项目：

**API 文件**:
```
api/orders/index.js
api/inventory/index.js
api/ads/index.js
api/users/index.js
api/site-modules/index.js
```

**前端文件**:
```
public/admin/index.html
public/assets/admin-core.js
public/assets/modules/orders.js
```

**迁移文件**:
```
migrations/001_create_management_tables.sql
```

**文档文件**:
```
docs/PHASE2_ARCHITECTURE.md
docs/PHASE2_DEPLOYMENT_GUIDE.md
```

#### 3.2 更新现有文件
更新以下现有文件：
```
docs/platform-architecture.md (已更新)
```

### 4. 功能验证

#### 4.1 API 接口测试
使用以下命令测试新 API：

```bash
# 测试订单管理 API
curl -X GET "https://your-domain.vercel.app/api/orders"

# 测试库存管理 API
curl -X GET "https://your-domain.vercel.app/api/inventory"

# 测试广告管理 API
curl -X GET "https://your-domain.vercel.app/api/ads"

# 测试用户管理 API
curl -X GET "https://your-domain.vercel.app/api/users"

# 测试站点模块配置 API
curl -X GET "https://your-domain.vercel.app/api/site-modules"
```

#### 4.2 管理后台访问
访问管理后台：
```
https://your-domain.vercel.app/admin/
```

### 5. 初始配置

#### 5.1 创建管理员用户
通过 Supabase 直接插入管理员用户：

```sql
-- 创建超级管理员用户
INSERT INTO users (username, email, password_hash, full_name, role_id, is_active)
VALUES (
    'admin',
    'admin@yourcompany.com',
    '$2a$10$your_hashed_password_here', -- 使用 bcrypt 加密的密码
    '系统管理员',
    (SELECT id FROM roles WHERE name = 'super_admin'),
    true
);
```

#### 5.2 配置站点模块
验证站点模块配置是否正确：

```sql
-- 检查站点模块配置
SELECT * FROM site_module_configs ORDER BY nav_order;
```

### 6. 权限配置

#### 6.1 角色权限验证
确保以下角色已正确配置：

```sql
-- 检查角色权限
SELECT name, permissions FROM roles;
```

#### 6.2 用户角色分配
为团队成员分配适当的角色：

```sql
-- 分配角色示例
UPDATE users 
SET role_id = (SELECT id FROM roles WHERE name = 'operations_manager')
WHERE username = 'operations_user';
```

## 🔧 配置选项

### 1. 站点模块配置

#### 1.1 启用/禁用模块
```sql
-- 禁用某个站点的广告模块
UPDATE site_module_configs 
SET enabled = false 
WHERE site_id = 'your_site_id' AND module_key = 'advertising';
```

#### 1.2 调整模块顺序
```sql
-- 调整模块显示顺序
UPDATE site_module_configs 
SET nav_order = 1 
WHERE module_key = 'orders';
```

### 2. 权限配置

#### 2.1 自定义角色权限
```sql
-- 创建自定义角色
INSERT INTO roles (name, description, permissions)
VALUES (
    'custom_role',
    '自定义角色',
    '{
        "sites": ["read"],
        "orders": ["read", "write"],
        "inventory": ["read"]
    }'
);
```

#### 2.2 模块可见性控制
```sql
-- 设置模块仅对特定角色可见
UPDATE site_module_configs 
SET visible_roles = ARRAY['super_admin', 'operations_manager']
WHERE module_key = 'inventory';
```

## 📊 监控和维护

### 1. 性能监控

#### 1.1 API 响应时间
监控以下关键 API 的响应时间：
- `/api/orders` - 订单查询
- `/api/inventory` - 库存查询
- `/api/ads` - 广告数据查询

#### 1.2 数据库性能
定期检查以下查询性能：
```sql
-- 检查慢查询
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

### 2. 数据备份

#### 2.1 定期备份
设置定期数据库备份：
```bash
# 使用 Supabase CLI 备份
supabase db dump --file backup_$(date +%Y%m%d).sql
```

#### 2.2 重要数据导出
定期导出关键业务数据：
```sql
-- 导出订单数据
COPY (SELECT * FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') 
TO '/tmp/orders_backup.csv' WITH CSV HEADER;
```

### 3. 安全维护

#### 3.1 用户权限审计
定期检查用户权限：
```sql
-- 检查用户权限
SELECT u.username, u.email, r.name as role, r.permissions
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE u.is_active = true;
```

#### 3.2 敏感数据保护
确保敏感数据加密：
```sql
-- 检查密码哈希
SELECT username, 
       CASE 
           WHEN password_hash LIKE '$2a$%' THEN 'Encrypted'
           ELSE 'Not Encrypted'
       END as encryption_status
FROM users;
```

## 🚨 故障排除

### 1. 常见问题

#### 1.1 API 返回 500 错误
**可能原因**:
- 环境变量未正确设置
- 数据库连接失败
- 表结构不存在

**解决方案**:
```bash
# 检查环境变量
vercel env ls

# 检查数据库连接
curl -X GET "https://your-domain.vercel.app/api/orders" -v
```

#### 1.2 管理后台无法访问
**可能原因**:
- 文件路径错误
- 静态资源加载失败

**解决方案**:
- 检查 `public/admin/index.html` 是否存在
- 检查浏览器控制台错误信息

#### 1.3 权限验证失败
**可能原因**:
- 用户角色未正确分配
- 权限配置错误

**解决方案**:
```sql
-- 检查用户角色
SELECT u.username, r.name as role 
FROM users u 
JOIN roles r ON u.role_id = r.id 
WHERE u.username = 'your_username';
```

### 2. 日志查看

#### 2.1 Vercel 日志
```bash
# 查看 Vercel 函数日志
vercel logs --follow
```

#### 2.2 数据库日志
在 Supabase 控制台查看数据库日志和查询性能。

## 📞 技术支持

### 1. 文档资源
- [Phase 2 架构文档](./PHASE2_ARCHITECTURE.md)
- [平台架构文档](./platform-architecture.md)
- [API 规格文档](../specs/openapi.yaml)

### 2. 联系信息
如遇到部署问题，请联系开发团队：
- 技术问题：开发团队
- 业务问题：产品团队
- 紧急问题：运维团队

---

**部署完成时间**: 2025-01-08  
**版本**: Phase 2.0  
**状态**: 生产就绪
