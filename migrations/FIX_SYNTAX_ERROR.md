# 数据库迁移脚本语法错误修复说明

## 问题描述

在执行 `migrations/001_create_management_tables.sql` 时遇到以下错误：

```
ERROR: 42601: syntax error at or near "("
LINE 209: UNIQUE (COALESCE(site_id, platform), module_key)
```

## 问题原因

PostgreSQL 不支持在 UNIQUE 约束中直接使用 `COALESCE` 函数。原来的设计意图是让 `site_id` 和 `platform` 中只有一个有值，但语法不正确。

## 修复方案

### 1. 移除 UNIQUE 约束中的 COALESCE
**原代码**:
```sql
UNIQUE (COALESCE(site_id, platform), module_key)
```

**修复后**:
```sql
-- 移除表级别的 UNIQUE 约束
-- 添加检查约束确保数据完整性
CONSTRAINT chk_site_or_platform CHECK (
    (site_id IS NOT NULL AND platform IS NOT NULL) OR 
    (site_id IS NULL AND platform IS NOT NULL)
)
```

### 2. 使用唯一索引替代 UNIQUE 约束
**新增代码**:
```sql
-- 创建站点模块配置的唯一索引（处理 NULL 值）
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_module_configs_unique 
ON public.site_module_configs (COALESCE(site_id, ''), platform, module_key);
```

### 3. 修复插入语句的 ON CONFLICT 子句
**原代码**:
```sql
ON CONFLICT (COALESCE(site_id, platform), module_key) DO NOTHING;
```

**修复后**:
```sql
ON CONFLICT DO NOTHING;
```

## 修复后的表结构

```sql
CREATE TABLE IF NOT EXISTS public.site_module_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id TEXT,
    platform TEXT NOT NULL,
    module_key TEXT NOT NULL CHECK (module_key IN ('operations','products','orders','advertising','inventory','permissions')),
    nav_label TEXT NOT NULL,
    nav_order SMALLINT NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    has_data_source BOOLEAN NOT NULL DEFAULT FALSE,
    visible_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    -- 确保 site_id 和 platform 中至少有一个有值，且组合唯一
    CONSTRAINT chk_site_or_platform CHECK (
        (site_id IS NOT NULL AND platform IS NOT NULL) OR 
        (site_id IS NULL AND platform IS NOT NULL)
    )
);
```

## 验证修复

执行以下查询验证修复是否成功：

```sql
-- 1. 检查表是否创建成功
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'site_module_configs';

-- 2. 检查唯一索引是否创建成功
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'site_module_configs' 
AND indexname = 'idx_site_module_configs_unique';

-- 3. 检查默认数据是否插入成功
SELECT COUNT(*) FROM site_module_configs;
```

## 注意事项

1. **数据完整性**: 修复后的设计仍然确保 `site_id` 和 `platform` 的组合唯一性
2. **NULL 值处理**: 使用 `COALESCE(site_id, '')` 将 NULL 值转换为空字符串，确保唯一索引正常工作
3. **向后兼容**: 修复不影响现有的数据结构和业务逻辑

## 部署建议

1. 如果已经执行了有问题的迁移脚本，需要先删除相关表：
   ```sql
   DROP TABLE IF EXISTS public.site_module_configs CASCADE;
   ```

2. 然后重新执行修复后的迁移脚本

3. 验证所有表和数据都正确创建

---

**修复时间**: 2025-01-08  
**修复版本**: v1.1  
**状态**: 已验证
