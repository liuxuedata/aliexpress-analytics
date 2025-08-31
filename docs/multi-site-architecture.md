# 多站点扩展架构设计文档

## 概述

本文档描述了跨境电商数据分析平台的多站点扩展功能，支持在速卖通自运营、独立站等平台下快速添加和管理多个站点。

## 架构设计

### 1. 数据库设计

#### 核心表结构

**站点管理表 (sites)**
```sql
CREATE TABLE public.sites (
  id          text primary key,           -- 站点唯一标识
  name        text not null,              -- 站点名称（如：A站、B站）
  platform    text not null,              -- 平台类型
  display_name text not null,             -- 显示名称
  is_active   boolean default true,       -- 是否激活
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**速卖通自运营数据表 (ae_self_operated_daily)**
```sql
CREATE TABLE public.ae_self_operated_daily (
  site        text not null default 'A站',  -- 新增：站点字段
  product_id  text not null,
  stat_date   date not null,
  -- ... 其他字段保持不变
  primary key (site, product_id, stat_date)  -- 主键包含站点
);
```

#### 支持的平台类型
- `ae_self_operated`: 速卖通自运营
- `independent`: 独立站
- `ae_managed`: 速卖通全托管

### 2. API 接口设计

#### 站点管理 API
- `GET /api/sites` - 获取站点列表
- `POST /api/sites` - 创建新站点
- `PUT /api/sites?id={id}` - 更新站点信息

#### 数据查询 API
- `GET /api/ae_self_operated/stats?site={site}&from={date}&to={date}` - 速卖通自运营数据
- `GET /api/independent/stats?site={site}&from={date}&to={date}` - 独立站数据

### 3. 前端功能

#### 站点管理页面
- 路径：`/site-management.html`
- 功能：添加、编辑、删除站点
- 支持按平台筛选站点

#### 站点切换功能
- 在自运营页面添加站点选择器
- 支持动态切换站点并重新加载数据
- 本地存储当前选择的站点

## 开发任务分工

### 第一阶段：数据库迁移（已完成）
- [x] 更新数据库表结构
- [x] 创建站点管理表
- [x] 编写迁移脚本
- [x] 更新API接口

### 第二阶段：后端API开发（已完成）
- [x] 创建站点管理API (`/api/sites`)
- [x] 更新速卖通自运营API支持站点参数
- [x] 创建速卖通自运营统计API
- [x] 保持独立站API兼容性

### 第三阶段：前端页面开发（已完成）
- [x] 创建站点管理页面
- [x] 更新自运营页面支持站点切换
- [x] 添加站点选择器UI
- [x] 实现站点添加功能

### 第四阶段：测试与优化（待完成）
- [ ] 数据库迁移测试
- [ ] API接口测试
- [ ] 前端功能测试
- [ ] 性能优化
- [ ] 错误处理完善

## 使用指南

### 1. 数据库迁移
```bash
# 在 Supabase SQL Editor 中执行
# 1. 备份现有数据
# 2. 执行 migration_add_site_field.sql
# 3. 验证迁移结果
```

### 2. 添加新站点
1. 访问 `/site-management.html`
2. 填写站点信息：
   - 站点名称：如 "B站"
   - 平台：选择对应平台
   - 显示名称：如 "速卖通自运营 B站"
3. 点击"添加站点"

### 3. 切换站点
1. 在自运营页面点击站点名称
2. 从下拉列表选择目标站点
3. 数据会自动重新加载

## 技术要点

### 1. 向后兼容性
- 现有数据默认分配到 "A站"
- API接口保持原有参数格式
- 前端页面支持渐进式升级

### 2. 数据隔离
- 每个站点的数据通过 `site` 字段隔离
- 查询时自动过滤对应站点数据
- 支持跨站点数据对比（未来功能）

### 3. 性能优化
- 为 `site` 字段创建索引
- 使用分页查询避免大数据量问题
- 前端缓存站点列表减少API调用

## 扩展计划

### 短期目标
1. 完善站点编辑和删除功能
2. 添加站点数据导入功能
3. 实现站点间数据对比

### 长期目标
1. 支持更多平台（亚马逊、TikTok等）
2. 实现站点数据同步功能
3. 添加站点权限管理
4. 支持站点数据导出

## 注意事项

1. **数据备份**：执行迁移前务必备份数据库
2. **测试环境**：先在测试环境验证功能
3. **用户培训**：向用户说明新功能使用方法
4. **监控告警**：添加站点数据异常监控

## 联系方式

如有问题请联系开发团队或提交 Issue。
