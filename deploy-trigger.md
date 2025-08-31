# 部署触发器

这个文件用于触发Vercel重新部署。

部署时间: 2025-01-01
触发原因: 修复API路由配置

## 修复内容

1. 添加了functions配置，指定API超时时间
2. 优化了Vercel路由配置
3. 确保所有API端点正确映射

## API端点

- `/api/health` - 健康检查
- `/api/test` - 测试API
- `/api/site-configs` - 站点配置管理
- `/api/data-source-templates` - 数据源模板
- `/api/dynamic-ingest/[siteId]` - 动态数据摄入
- `/api/dynamic-ingest/[siteId]/generate-test-data` - 测试数据生成
