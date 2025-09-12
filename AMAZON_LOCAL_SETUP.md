# Amazon SP-API 本地数据拉取设置指南

## 问题背景

由于Vercel的网络环境限制，无法直接从云端访问Amazon SP-API。因此我们使用本地数据拉取 + 云端同步的方案。

## 解决方案

1. **本地拉取**: 在本地环境运行Amazon SP-API数据拉取
2. **云端同步**: 通过API端点将数据同步到云端数据库
3. **前端展示**: 在云端前端页面查看数据

## 环境配置

### 1. 创建环境变量文件

创建 `.env` 文件，包含以下配置：

```bash
# Amazon SP-API 配置
AMZ_LWA_CLIENT_ID=your_lwa_client_id
AMZ_LWA_CLIENT_SECRET=your_lwa_client_secret
AMZ_SP_REFRESH_TOKEN=your_refresh_token
AMZ_APP_REGION=us-east-1
AMZ_MARKETPLACE_IDS=ATVPDKIKX0DER,A1F83G8C2ARO7P,A1PA6795UKMFR9,A1VC38T7YXB528

# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# 同步配置
SYNC_URL=https://your-domain.vercel.app/api/amazon/local-sync
```

### 2. 安装依赖

```bash
npm install node-fetch @supabase/supabase-js
```

## 使用方法

### 1. 运行数据拉取脚本

```bash
node amazon-local-puller.js
```

### 2. 脚本功能

- 自动拉取最近7天的Amazon数据
- 解析SP-API返回的报表数据
- 通过API同步到云端数据库
- 提供详细的执行日志

### 3. 查看数据

访问前端页面查看同步的数据：
```
https://your-domain.vercel.app/amazon-overview.html
```

## 自动化设置

### 1. 定时任务 (Windows)

创建批处理文件 `amazon-pull.bat`:

```batch
@echo off
cd /d "C:\path\to\your\project"
node amazon-local-puller.js
```

在任务计划程序中设置每日运行。

### 2. 定时任务 (Linux/Mac)

```bash
# 编辑crontab
crontab -e

# 添加每日凌晨2点运行
0 2 * * * cd /path/to/your/project && node amazon-local-puller.js
```

## 故障排除

### 1. 环境变量问题

确保所有必需的环境变量都已正确设置：
- `AMZ_LWA_CLIENT_ID`
- `AMZ_LWA_CLIENT_SECRET`
- `AMZ_SP_REFRESH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. 网络连接问题

确保本地网络可以访问：
- `https://api.amazon.com` (LWA认证)
- `https://sellingpartnerapi-us-east-1.amazon.com` (SP-API)
- `https://your-domain.vercel.app` (云端同步)

### 3. 权限问题

确保Amazon SP-API应用具有以下权限：
- `GET_SALES_AND_TRAFFIC_REPORT`
- 相应的marketplace访问权限

### 4. 数据格式问题

如果数据同步失败，检查：
- 数据格式是否符合预期
- 数据库表结构是否正确
- 云端API端点是否可访问

## 监控和日志

### 1. 执行日志

脚本会输出详细的执行日志，包括：
- 认证状态
- 报表创建和下载进度
- 数据解析结果
- 同步状态

### 2. 错误处理

脚本包含完整的错误处理：
- 网络连接错误
- API认证错误
- 数据解析错误
- 同步错误

## 扩展功能

### 1. 自定义拉取天数

修改 `CONFIG.daysToPull` 参数：

```javascript
const CONFIG = {
  // ...
  daysToPull: 30, // 拉取最近30天
};
```

### 2. 自定义报表类型

修改 `CONFIG.reportType` 参数：

```javascript
const CONFIG = {
  // ...
  reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA', // 其他报表类型
};
```

### 3. 批量处理

可以修改脚本支持批量处理多个marketplace或日期范围。

## 安全注意事项

1. **环境变量安全**: 不要将 `.env` 文件提交到版本控制
2. **API密钥管理**: 定期轮换Amazon SP-API密钥
3. **网络安全**: 确保本地网络环境安全
4. **数据备份**: 定期备份数据库数据

## 联系支持

如果遇到问题，请检查：
1. 环境变量配置
2. 网络连接状态
3. Amazon SP-API权限
4. 云端API端点状态

---

**注意**: 这个方案是临时解决方案，长期来看建议：
1. 使用AWS Lambda等支持Amazon API的平台
2. 配置专用的代理服务
3. 申请Amazon SP-API的IP白名单
