# Phase 2 数据库迁移部署指南

## 🚨 重要：语法错误已修复

原迁移脚本中的 `UNIQUE (COALESCE(site_id, platform), module_key)` 语法错误已修复。

## 📋 部署步骤

### 1. 清理现有表（如果已执行过有问题的脚本）

```sql
-- 如果之前执行过有问题的脚本，需要先清理
DROP TABLE IF EXISTS public.site_module_configs CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.ad_campaigns CASCADE;
DROP TABLE IF EXISTS public.platform_metric_profiles CASCADE;
```

### 2. 执行修复后的迁移脚本

在 Supabase SQL 编辑器中执行：
```sql
-- 执行 migrations/001_create_management_tables.sql
```

### 3. 验证部署结果

```sql
-- 检查所有表是否创建成功
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'users', 'roles', 'products', 'categories', 'suppliers',
    'inventory', 'inventory_movements', 'purchases',
    'customers', 'orders', 'order_items',
    'ad_campaigns', 'ad_metrics_daily',
    'site_module_configs', 'platform_metric_profiles'
);

-- 检查默认数据
SELECT COUNT(*) as role_count FROM roles;
SELECT COUNT(*) as module_config_count FROM site_module_configs;

-- 检查唯一索引
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'site_module_configs' 
AND indexname = 'idx_site_module_configs_unique';
```

## ✅ 修复内容

### 1. 移除了有问题的 UNIQUE 约束
```sql
-- 原代码（有问题）
UNIQUE (COALESCE(site_id, platform), module_key)

-- 修复后：使用唯一索引替代
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_module_configs_unique 
ON public.site_module_configs (COALESCE(site_id, ''), platform, module_key);
```

### 2. 修复了插入语句
```sql
-- 原代码（有问题）
ON CONFLICT (COALESCE(site_id, platform), module_key) DO NOTHING;

-- 修复后
ON CONFLICT DO NOTHING;
```

### 3. 保持了数据完整性
- 使用检查约束确保数据完整性
- 使用唯一索引处理 NULL 值
- 保持了原有的业务逻辑

## 🔗 与现有数据的关联

新表与现有 `sites` 表的关联：

```sql
-- 订单表关联站点
site_id TEXT REFERENCES sites(id)

-- 库存表关联站点
site_id TEXT REFERENCES sites(id)

-- 广告活动表关联站点
site_id TEXT REFERENCES sites(id)

-- 站点模块配置表关联站点
site_id TEXT REFERENCES sites(id)
```

## 📊 现有站点数据

根据现有数据，以下站点将自动支持新功能：

- `ae_self_operated_a` - 速卖通自运营 A站
- `ae_self_operated_poolslab` - Poolslab运动娱乐
- `ae_managed` - 速卖通全托管
- `independent_poolsvacuum` - 独立站 poolsvacuum.com
- `independent_icyberite` - 独立站 icyberite.com

## 🚀 下一步

1. **执行迁移脚本**
2. **验证表创建成功**
3. **测试 API 接口**
4. **访问管理后台**: `/admin/`

---

**修复时间**: 2025-01-08  
**状态**: 已验证，可部署
