# Lazada API 生产环境升级指南

## 🎯 目标

将 Lazada API 从测试状态升级为正式生产状态，确保所有业务功能正常运行。

## ✅ 当前状态确认

### 认证状态
- ✅ **OAuth 认证成功**：能够正常获取 `refresh_token` 和 `access_token`
- ✅ **API 连通性正常**：`/api/lazada/orders`、`/api/lazada/ads`、`/api/lazada/stats` 都返回 200 状态码
- ✅ **令牌管理正常**：能够正确存储和刷新令牌

### 测试环境验证
- ✅ **订单 API 测试**：`/api/lazada/orders/test` 返回成功
- ✅ **业务接口正常**：所有 Lazada 相关 API 调用成功
- ✅ **数据同步正常**：能够正常获取和存储 Lazada 数据

## 🚀 升级到生产环境的步骤

### 1. Lazada 开发者平台操作

#### 1.1 提交应用审核
1. 登录 [Lazada Open Platform](https://open.lazada.com/)
2. 进入您的应用管理页面
3. 找到"应用审核"或"Submit for Review"选项
4. 填写应用信息：
   - 应用名称和描述
   - 应用功能说明
   - 使用场景描述
   - 技术架构说明

#### 1.2 准备审核材料
- **应用功能文档**：详细说明应用的主要功能
- **技术架构图**：展示系统架构和数据流
- **隐私政策**：说明数据使用和保护措施
- **用户协议**：明确用户权利和义务

### 2. 环境配置更新

#### 2.1 获取生产环境凭证
审核通过后，您将获得：
- 新的 `LAZADA_APP_KEY`（生产环境）
- 新的 `LAZADA_APP_SECRET`（生产环境）
- 生产环境的回调 URL 配置

#### 2.2 更新环境变量
```bash
# 生产环境配置
LAZADA_APP_KEY=your_production_app_key
LAZADA_APP_SECRET=your_production_app_secret
LAZADA_REDIRECT_URI=https://aliexpress-analytics.vercel.app/api/lazada/oauth/callback
```

#### 2.3 更新 Vercel 环境变量
1. 登录 Vercel Dashboard
2. 进入项目设置
3. 更新环境变量：
   - `LAZADA_APP_KEY` → 生产环境密钥
   - `LAZADA_APP_SECRET` → 生产环境密钥
4. 重新部署应用

### 3. 生产环境测试

#### 3.1 重新授权流程
1. 清除现有的测试令牌
2. 重新进行 OAuth 授权
3. 验证生产环境令牌获取

#### 3.2 API 功能验证
```bash
# 测试订单 API
curl "https://aliexpress-analytics.vercel.app/api/lazada/orders/test?siteId=your_site_id"

# 测试统计 API
curl "https://aliexpress-analytics.vercel.app/api/lazada/stats?siteId=your_site_id"

# 测试广告 API
curl "https://aliexpress-analytics.vercel.app/api/lazada/ads?siteId=your_site_id"
```

#### 3.3 数据同步验证
1. 检查订单数据同步
2. 验证统计数据准确性
3. 确认广告数据获取

### 4. 监控和维护

#### 4.1 设置监控
- 配置 API 调用监控
- 设置错误告警
- 监控令牌过期和刷新

#### 4.2 日志管理
- 启用详细日志记录
- 设置日志轮转
- 配置日志分析

## 📋 升级检查清单

### 审核准备
- [ ] 应用功能文档完整
- [ ] 技术架构图清晰
- [ ] 隐私政策已准备
- [ ] 用户协议已制定

### 环境配置
- [ ] 生产环境凭证已获取
- [ ] 环境变量已更新
- [ ] Vercel 配置已同步
- [ ] 应用已重新部署

### 功能验证
- [ ] OAuth 授权流程正常
- [ ] 令牌获取和刷新正常
- [ ] 订单 API 调用成功
- [ ] 统计 API 调用成功
- [ ] 广告 API 调用成功
- [ ] 数据同步正常

### 监控设置
- [ ] API 监控已配置
- [ ] 错误告警已设置
- [ ] 日志记录已启用
- [ ] 性能监控已配置

## 🔧 故障排除

### 常见问题

#### 1. 审核被拒绝
**原因**：应用信息不完整或不符合要求
**解决方案**：
- 完善应用功能描述
- 提供详细的技术文档
- 确保符合 Lazada 平台规范

#### 2. 生产环境 API 调用失败
**原因**：环境变量未正确更新
**解决方案**：
- 检查环境变量配置
- 确认使用生产环境凭证
- 重新部署应用

#### 3. 令牌获取失败
**原因**：生产环境回调 URL 配置错误
**解决方案**：
- 检查 Lazada 应用配置
- 确认回调 URL 一致性
- 重新进行授权流程

## 📞 支持资源

### Lazada 官方支持
- [Lazada Open Platform 文档](https://open.lazada.com/doc/doc.htm)
- [开发者社区](https://open.lazada.com/community)
- 技术支持邮箱：developer@lazada.com

### 内部支持
- 技术文档：`/docs/lazada-oauth-troubleshooting-guide.md`
- 测试工具：`/api/lazada-token-test-direct.js`
- 自检脚本：`/scripts/lazada-oauth-self-check.js`

## 📈 后续优化

### 性能优化
- 实现令牌缓存机制
- 优化 API 调用频率
- 添加重试机制

### 功能扩展
- 支持更多 Lazada API
- 添加数据导出功能
- 实现实时数据同步

### 监控增强
- 添加业务指标监控
- 实现自动化告警
- 建立性能基线

---

**注意**：升级到生产环境是一个重要步骤，请确保在升级前进行充分的测试，并准备好回滚方案。
