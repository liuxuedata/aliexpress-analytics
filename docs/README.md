# 跨境电商管理平台 - 文档索引

## 📚 文档概览

本文档库包含了跨境电商管理平台的完整技术文档，涵盖架构设计、开发规范、部署指南等。

## 📋 核心文档

### 架构设计
- **[平台架构文档](./platform-architecture.md)** - 整体系统架构设计
- **[Phase 2 架构文档](./PHASE2_ARCHITECTURE.md)** - Phase 2 扩展功能详细设计
- **[多站点架构文档](./multi-site-architecture.md)** - 多站点扩展架构

### 开发规范
- **[数据库开发规范](./DATABASE_STANDARDS.md)** - 数据库设计和使用规范
- **[站点配置指南](./SITE_CONFIGURATION_GUIDE.md)** - 站点配置框架使用指南
- **[站点配置框架](./site-configuration-framework.md)** - 站点配置框架设计

### 部署指南
- **[Phase 2 部署指南](./PHASE2_DEPLOYMENT_GUIDE.md)** - Phase 2 功能部署指南
- **[迁移指南](./MIGRATION_GUIDE.md)** - 数据库迁移指南

### 技术规格
- **[UI 网络架构](./ui-network-architecture.md)** - 前端网络架构设计
- **[CODEx 说明](./CODEx_README.md)** - CODEx 开发工具说明

## 🔧 重要修复

### PostgreSQL 语法错误修复
- **问题**: `UNIQUE (COALESCE(site_id, platform), module_key)` 语法错误
- **修复**: 使用唯一索引替代 UNIQUE 约束
- **文件**: `migrations/001_create_management_tables.sql`
- **文档**: [数据库开发规范](./DATABASE_STANDARDS.md)

### 修复详情
```sql
-- 错误写法（PostgreSQL 不支持）
UNIQUE (COALESCE(site_id, platform), module_key)

-- 正确写法
CREATE UNIQUE INDEX idx_site_module_configs_unique 
ON public.site_module_configs (COALESCE(site_id, ''), platform, module_key);
```

## 📊 数据库表结构

### 核心业务表
- **用户权限**: `users`, `roles`
- **产品管理**: `products`, `categories`, `suppliers`
- **库存管理**: `inventory`, `inventory_movements`, `purchases`
- **订单管理**: `orders`, `order_items`, `customers`
- **广告管理**: `ad_campaigns`, `ad_metrics_daily`
- **站点配置**: `site_module_configs`, `platform_metric_profiles`

### 现有数据表
- **站点管理**: `sites`
- **运营数据**: `ae_self_operated_daily`, `independent_facebook_ads_daily`, `independent_landing_metrics`

## 🚀 API 接口

### 新增 API
- `/api/orders/` - 订单管理
- `/api/inventory/` - 库存管理
- `/api/ads/` - 广告管理
- `/api/users/` - 用户权限管理
- `/api/site-modules/` - 站点模块配置

### 现有 API
- `/api/sites/` - 站点管理
- `/api/ae_query/` - 速卖通数据查询
- `/api/independent/stats/` - 独立站数据查询

## 🎨 前端架构

### 管理后台
- **主页面**: `public/admin/index.html`
- **核心脚本**: `public/assets/admin-core.js`
- **功能模块**: `public/assets/modules/`

### 现有页面
- **自运营**: `public/self-operated.html`
- **全托管**: `public/managed.html`
- **独立站**: `public/independent-site.html`
- **站点配置**: `public/site-configuration.html`

## 📁 文件结构

```
docs/
├── README.md                           # 文档索引（本文件）
├── platform-architecture.md           # 平台架构文档
├── PHASE2_ARCHITECTURE.md             # Phase 2 架构文档
├── PHASE2_DEPLOYMENT_GUIDE.md         # Phase 2 部署指南
├── DATABASE_STANDARDS.md              # 数据库开发规范
├── multi-site-architecture.md         # 多站点架构文档
├── SITE_CONFIGURATION_GUIDE.md        # 站点配置指南
├── site-configuration-framework.md    # 站点配置框架
├── MIGRATION_GUIDE.md                 # 迁移指南
├── ui-network-architecture.md         # UI 网络架构
└── CODEx_README.md                    # CODEx 说明
```

## 🔄 版本历史

### v2.2 (Phase 2) - 2025-01-08
- ✅ 完成 Phase 2 核心功能开发
- ✅ 修复 PostgreSQL 语法错误
- ✅ 建立数据库开发规范
- ✅ 完善技术文档

### v2.1 - 2025-01-08
- ✅ 多站点架构设计
- ✅ 站点配置框架
- ✅ 运营数据分析功能

### v2.0 - 2025-01-08
- ✅ 基础平台架构
- ✅ 速卖通数据集成
- ✅ 独立站数据集成

## 📞 技术支持

### 开发团队
- **架构设计**: 系统架构师
- **后端开发**: 后端开发团队
- **前端开发**: 前端开发团队
- **数据库**: 数据库管理员

### 联系方式
- **技术问题**: 开发团队
- **业务问题**: 产品团队
- **紧急问题**: 运维团队

---

**最后更新**: 2025-01-08  
**版本**: v2.2 (Phase 2)  
**状态**: 生产就绪
