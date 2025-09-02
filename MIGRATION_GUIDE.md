# 数据库迁移执行指南

## 问题说明
您遇到的错误 `ERROR: 42703: column "site" does not exist` 是因为：
1. 数据库中已经存在旧的表结构（没有 `site` 字段）
2. 新的 schema 文件试图创建包含 `site` 字段的表，但表已存在

## 解决方案

### 方案一：智能迁移（推荐）
如果您已经有数据需要保留，请执行：

1. **在 Supabase SQL Editor 中运行**：
   ```sql
   -- 执行智能迁移脚本
   -- 文件：migration_smart_add_site_field.sql
   ```

2. **这个脚本会**：
   - 检查现有表结构
   - 智能地添加缺失的字段
   - 备份现有数据
   - 更新主键约束
   - 创建必要的索引和视图
   - 处理不完整的sites表结构
   - 初始化站点管理表

### 方案二：全新部署
如果是全新环境或可以清空数据：

1. **删除现有表**（如果有）：
   ```sql
   DROP TABLE IF EXISTS public.ae_self_operated_daily CASCADE;
   DROP TABLE IF EXISTS public.sites CASCADE;
   ```

2. **运行新 schema**：
   ```sql
   -- 执行新schema文件
   -- 文件：supabase_schema_new.sql
   ```

## 执行步骤

### 1. 备份数据（重要）
```sql
-- 在 Supabase SQL Editor 中执行
CREATE TABLE ae_self_operated_daily_backup AS 
SELECT * FROM ae_self_operated_daily;
```

### 2. 执行迁移
选择以下任一方式：

**方式A：使用智能迁移脚本**
```sql
-- 复制 migration_smart_add_site_field.sql 的内容到 SQL Editor
-- 然后点击 "Run" 执行
```

**方式B：手动执行**
```sql
-- 1. 添加site字段
ALTER TABLE public.ae_self_operated_daily 
ADD COLUMN site text NOT NULL DEFAULT 'A站';

-- 2. 更新主键
ALTER TABLE public.ae_self_operated_daily 
DROP CONSTRAINT IF EXISTS ae_self_operated_daily_pkey;

ALTER TABLE public.ae_self_operated_daily 
ADD CONSTRAINT ae_self_operated_daily_pkey 
PRIMARY KEY (site, product_id, stat_date);

-- 3. 创建索引
CREATE INDEX idx_ae_self_operated_daily_site 
ON public.ae_self_operated_daily(site);

-- 4. 创建站点管理表
CREATE TABLE IF NOT EXISTS public.sites (
  id          text primary key,
  name        text not null,
  platform    text not null,
  display_name text not null,
  is_active   boolean default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 5. 初始化默认站点
INSERT INTO public.sites (id, name, platform, display_name) VALUES
  ('ae_self_operated_a', 'A站', 'ae_self_operated', '速卖通自运营 A站'),
  ('independent_poolsvacuum', 'poolsvacuum.com', 'independent', '独立站 poolsvacuum.com')
ON CONFLICT (id) DO NOTHING;
```

### 3. 验证迁移结果
```sql
-- 检查表结构
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'ae_self_operated_daily'
ORDER BY ordinal_position;

-- 检查数据
SELECT COUNT(*) as total_records FROM ae_self_operated_daily;
SELECT COUNT(*) as total_sites FROM sites;

-- 检查site字段
SELECT DISTINCT site FROM ae_self_operated_daily;
```

## 常见问题

### Q: 迁移后数据丢失怎么办？
A: 执行迁移前会自动创建备份表 `ae_self_operated_daily_backup`，可以从备份恢复：
```sql
-- 恢复数据（如果需要）
INSERT INTO ae_self_operated_daily 
SELECT 'A站' as site, * FROM ae_self_operated_daily_backup;
```

### Q: 迁移过程中出错怎么办？
A: 检查错误信息，常见问题：
1. 权限不足：确保使用正确的数据库用户
2. 表被锁定：等待其他操作完成
3. 约束冲突：检查是否有重复的主键数据

### Q: 如何回滚迁移？
A: 如果迁移失败，可以回滚：
```sql
-- 删除新添加的字段
ALTER TABLE public.ae_self_operated_daily DROP COLUMN IF EXISTS site;

-- 恢复原主键
ALTER TABLE public.ae_self_operated_daily 
ADD CONSTRAINT ae_self_operated_daily_pkey 
PRIMARY KEY (product_id, stat_date);
```

## 迁移完成后的验证

1. **检查API是否正常工作**：
   - 访问 `/api/sites` 查看站点列表
   - 测试数据上传功能

2. **检查前端功能**：
   - 访问 `/site-management.html` 测试站点管理
   - 在自运营页面测试站点切换

3. **清理备份**（可选）：
   ```sql
   -- 确认一切正常后，可以删除备份表
   DROP TABLE ae_self_operated_daily_backup;
   ```

## 联系支持

如果遇到问题，请：
1. 记录完整的错误信息
2. 提供当前表结构信息
3. 联系开发团队获取支持
