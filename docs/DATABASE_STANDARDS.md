# 数据库开发规范文档

## 📋 概述

本文档定义了跨境电商管理平台的数据库开发规范，确保数据一致性和开发标准化。

## 🏗️ 表结构规范

### 1. 命名规范

#### 表名规范
- 使用小写字母和下划线
- 表名使用复数形式
- 示例：`users`, `order_items`, `ad_campaigns`

#### 字段名规范
- 使用小写字母和下划线
- 布尔字段使用 `is_` 前缀
- 时间字段使用 `_at` 后缀
- 示例：`is_active`, `created_at`, `updated_at`

#### 索引名规范
- 使用 `idx_` 前缀
- 格式：`idx_{table_name}_{field_name}`
- 示例：`idx_orders_site_id`, `idx_inventory_product_id`

### 2. 数据类型规范

#### 主键
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

#### 时间字段
```sql
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

#### 状态字段
```sql
status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped'))
```

#### 金额字段
```sql
price DECIMAL(10,2) DEFAULT 0
```

#### 数量字段
```sql
quantity INTEGER DEFAULT 0
```

### 3. 约束规范

#### 外键约束
```sql
-- 标准外键格式
site_id TEXT REFERENCES sites(id)
user_id UUID REFERENCES users(id)
```

#### 唯一约束
```sql
-- 单字段唯一
sku VARCHAR(100) UNIQUE NOT NULL

-- 多字段唯一
UNIQUE(product_id, site_id)
```

#### 检查约束
```sql
-- 状态值检查
CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'))

-- 数值范围检查
CHECK (quantity > 0)
```

## 🔧 特殊处理规范

### 1. NULL 值处理

#### 唯一索引中的 NULL 值
```sql
-- 错误写法（PostgreSQL 不支持）
UNIQUE (COALESCE(site_id, platform), module_key)

-- 正确写法
CREATE UNIQUE INDEX idx_table_unique 
ON table_name (COALESCE(field_name, ''), other_field);
```

#### 可选外键
```sql
-- 允许 NULL 的外键
category_id UUID REFERENCES categories(id)  -- 可以为 NULL
```

### 2. 触发器规范

#### 更新时间触发器
```sql
-- 创建触发器函数
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用触发器
CREATE TRIGGER trg_table_name_updated_at 
BEFORE UPDATE ON public.table_name
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### 3. RLS 策略规范

#### 开发期策略
```sql
-- 启用 RLS
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- 开发期允许所有访问
CREATE POLICY p_table_name_all ON public.table_name 
FOR ALL TO anon USING (true);
```

## 📊 数据关联规范

### 1. 站点关联

所有业务表都应关联到 `sites` 表：
```sql
-- 标准站点关联
site_id TEXT REFERENCES sites(id)
```

### 2. 用户关联

需要记录操作者的表应关联到 `users` 表：
```sql
-- 标准用户关联
created_by UUID REFERENCES users(id)
updated_by UUID REFERENCES users(id)
```

### 3. 产品关联

涉及产品的表应关联到 `products` 表：
```sql
-- 标准产品关联
product_id UUID REFERENCES products(id)
```

## 🚀 迁移脚本规范

### 1. 脚本结构

```sql
-- 脚本头部信息
-- Phase X 功能数据库迁移脚本
-- 创建时间: YYYY-MM-DD
-- 描述: 功能说明
-- 修复: 修复说明（如有）

-- 1. 表创建
CREATE TABLE IF NOT EXISTS public.table_name (
    -- 表结构定义
);

-- 2. 索引创建
CREATE INDEX IF NOT EXISTS idx_table_name_field ON public.table_name(field);

-- 3. 触发器创建
CREATE TRIGGER trg_table_name_updated_at 
BEFORE UPDATE ON public.table_name
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS 策略
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_table_name_all ON public.table_name FOR ALL TO anon USING (true);

-- 5. 默认数据插入
INSERT INTO public.table_name (field1, field2) VALUES
('value1', 'value2')
ON CONFLICT DO NOTHING;
```

### 2. 错误处理

#### 冲突处理
```sql
-- 使用 ON CONFLICT 处理重复数据
INSERT INTO public.table_name (field1, field2) VALUES
('value1', 'value2')
ON CONFLICT (unique_field) DO NOTHING;

-- 或者更新现有数据
ON CONFLICT (unique_field) DO UPDATE SET
    field2 = EXCLUDED.field2,
    updated_at = NOW();
```

#### 条件创建
```sql
-- 使用 IF NOT EXISTS 避免重复创建
CREATE TABLE IF NOT EXISTS public.table_name (...);
CREATE INDEX IF NOT EXISTS idx_name ON public.table_name(field);
```

## 📋 验证规范

### 1. 表创建验证

```sql
-- 检查表是否存在
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'table_name';

-- 检查表结构
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'table_name'
ORDER BY ordinal_position;
```

### 2. 索引验证

```sql
-- 检查索引是否存在
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'table_name' 
AND indexname = 'idx_name';
```

### 3. 数据验证

```sql
-- 检查默认数据
SELECT COUNT(*) FROM table_name;

-- 检查数据完整性
SELECT COUNT(*) FROM table_name WHERE field IS NULL;
```

## 🌐 Vercel 路由规范

### 1. 静态文件路由

根据 `vercel.json` 配置，静态文件应遵循以下规则：

```json
{
  "src": "/(.*)",
  "dest": "/public/$1"
}
```

**文件路径规范**:
- 静态文件直接放在 `public/` 目录下
- 管理后台页面：`public/admin/index.html`
- 核心脚本：`public/admin-core.js`
- 模块文件：`public/modules/`
- 样式文件：`public/assets/` (保持现有结构)

### 2. API 路由配置

在 `vercel.json` 中添加新的API路由：

```json
{
  "src": "/api/orders",
  "dest": "/api/orders/index.js"
},
{
  "src": "/api/inventory", 
  "dest": "/api/inventory/index.js"
},
{
  "src": "/api/ads",
  "dest": "/api/ads/index.js"
},
{
  "src": "/api/users",
  "dest": "/api/users/index.js"
},
{
  "src": "/api/site-modules",
  "dest": "/api/site-modules/index.js"
}
```

### 3. 文件访问路径

**管理后台访问**:
```
https://your-domain.vercel.app/admin/
```

**静态资源访问**:
```
https://your-domain.vercel.app/admin-core.js
https://your-domain.vercel.app/modules/analytics.js
https://your-domain.vercel.app/assets/theme.css
```

## 🔄 版本控制规范

### 1. 迁移脚本命名

```
migrations/
├── 001_create_management_tables.sql
├── 002_add_new_feature.sql
├── 003_fix_bug.sql
└── 004_update_schema.sql
```

### 2. 版本记录

每个迁移脚本都应包含版本信息：
```sql
-- 版本: v1.0
-- 创建时间: 2025-01-08
-- 作者: 开发团队
-- 描述: 功能说明
```

## 📞 维护指南

### 1. 定期检查

- 检查表结构一致性
- 验证索引性能
- 监控数据完整性

### 2. 备份策略

- 定期备份重要数据
- 测试恢复流程
- 文档化备份过程

### 3. 性能优化

- 监控慢查询
- 优化索引设计
- 定期清理无用数据

---

**最后更新**: 2025-01-08  
**版本**: v1.0  
**状态**: 生产就绪
