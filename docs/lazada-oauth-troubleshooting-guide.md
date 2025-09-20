# Lazada OAuth 接入与排错指南

## 概述

本文档详细说明 Lazada OAuth 授权流程的正确实现方式，以及如何排查和解决 `refresh_token` 无法获取的问题。

## 问题背景

在 Lazada 授权流程中，经常遇到以下问题：
1. **refresh_token 缺失**：授权成功后无法获取长期有效的刷新令牌
2. **页面授权流程失败**：前端授权按钮点击后无法正常跳转或回调
3. **令牌过期过快**：获取的 access_token 有效期过短（约10秒）

## 根本原因分析

### 1. OAuth 端点混用问题

**❌ 错误做法**：使用签名版 `/auth/token/create` 端点
```javascript
// 错误：使用签名版端点
const TOKEN_ENDPOINT = 'https://auth.lazada.com/rest/auth/token/create';
```

**✅ 正确做法**：使用标准 OAuth2 `/oauth/token` 端点
```javascript
// 正确：使用标准 OAuth2 端点
const OAUTH_TOKEN_ENDPOINT = 'https://auth.lazada.com/oauth/token';
```

### 2. redirect_uri 三处不一致

Lazada OAuth 要求以下三处的 `redirect_uri` 必须完全一致：

1. **Lazada 应用配置**：在 Lazada 开发者控制台中配置的回调地址
2. **授权请求**：`/api/lazada/oauth/start` 生成的授权链接中的 `redirect_uri` 参数
3. **令牌请求**：`/api/lazada/oauth/callback` 向 Lazada 换取令牌时的 `redirect_uri` 参数

### 3. 授权码重复使用

Lazada 的授权码（authorization code）只能使用一次，重复使用会导致失败。

## 正确实现方案

### 1. OAuth 授权启动端点

```javascript
// GET /api/lazada/oauth/start
const AUTHORIZE_ENDPOINT = 'https://auth.lazada.com/oauth/authorize';

function buildAuthorizeUrl({ appKey, redirectUri, state, sellerShortCode }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,  // 必须与 Lazada 应用配置一致
    state,
    force_auth: 'true'
  });

  if (sellerShortCode) {
    params.set('seller_short_code', sellerShortCode);
  }

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}
```

### 2. OAuth 回调端点（标准 OAuth2）

```javascript
// GET /api/lazada/oauth/callback-oauth2
const OAUTH_TOKEN_ENDPOINT = 'https://auth.lazada.com/oauth/token';

async function exchangeAuthorizationCodeWithOAuth2(code, redirectUri) {
  const clientId = process.env.LAZADA_APP_KEY;
  const clientSecret = process.env.LAZADA_APP_SECRET;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri  // 必须与授权请求中的 redirect_uri 一致
  });

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  return response.json();
}
```

### 3. 刷新令牌端点

```javascript
// POST /api/lazada/oauth/refresh
async function refreshTokenWithOAuth2(refreshToken) {
  const clientId = process.env.LAZADA_APP_KEY;
  const clientSecret = process.env.LAZADA_APP_SECRET;
  const redirectUri = process.env.LAZADA_REDIRECT_URI;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    redirect_uri: redirectUri  // 必须与初始授权时的 redirect_uri 一致
  });

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: params.toString()
  });

  return response.json();
}
```

## 环境变量配置

### 必需环境变量

```bash
# Lazada 应用配置
LAZADA_APP_KEY=your_app_key
LAZADA_APP_SECRET=your_app_secret
LAZADA_REDIRECT_URI=https://your-domain.com/api/lazada/oauth/callback-oauth2

# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### redirect_uri 配置检查清单

- [ ] Lazada 开发者控制台中的应用回调地址
- [ ] 环境变量 `LAZADA_REDIRECT_URI`
- [ ] 授权请求中的 `redirect_uri` 参数
- [ ] 令牌请求中的 `redirect_uri` 参数

## 一键自检脚本

### 1. 最小化测试程序（推荐用于问题定位）

使用专门的最小化测试程序来检查 Lazada Token API 的原始响应：

```bash
# 测试授权码换取令牌（打印原始响应）
node api/lazada_token_test.js --code=your_authorization_code
```

**特点**：
- 专门用于定位 `refresh_token` 缺失问题
- 打印 Lazada API 的原始响应内容
- 对比标准 OAuth2 端点和签名版端点的差异
- 提供详细的字段分析和错误诊断

### 2. 完整自检脚本

使用提供的完整自检脚本验证配置：

```bash
# 测试授权码换取令牌
node scripts/lazada-oauth-self-check.js --code=your_authorization_code

# 测试刷新令牌
node scripts/lazada-oauth-self-check.js --refresh-token=your_refresh_token
```

### 自检脚本功能

1. **环境变量检查**：验证所有必需的环境变量是否配置
2. **OAuth2 令牌换取测试**：使用真实授权码测试令牌获取
3. **刷新令牌测试**：验证刷新令牌功能
4. **自动诊断**：提供常见错误的排查建议

## 常见错误与解决方案

### 1. refresh_token 缺失

**错误信息**：`Lazada OAuth response missing refresh_token`

**可能原因**：
- 使用了签名版 `/auth/token/create` 端点
- `redirect_uri` 三处不一致
- 授权码重复使用
- 非卖家账号授权

**解决方案**：
1. 确保使用标准 OAuth2 `/oauth/token` 端点
2. 检查并统一所有 `redirect_uri` 配置
3. 使用新的授权码
4. 确认使用卖家账号进行授权

### 2. 授权码无效

**错误信息**：`invalid_grant` 或 `authorization_code_expired`

**解决方案**：
- 授权码只能使用一次，需要重新获取
- 检查授权码是否过期（通常有效期很短）

### 3. redirect_uri 不匹配

**错误信息**：`redirect_uri_mismatch`

**解决方案**：
- 确保 Lazada 应用配置、环境变量、请求参数中的 `redirect_uri` 完全一致
- 检查 URL 编码和大小写

### 4. 应用配置错误

**错误信息**：`invalid_client`

**解决方案**：
- 检查 `LAZADA_APP_KEY` 和 `LAZADA_APP_SECRET` 是否正确
- 确认应用状态是否正常

## 业务接口测试

### 订单接口连通性测试

```bash
# 测试 Lazada 订单 API 连通性
curl "https://your-domain.com/api/lazada/orders/test?siteId=your_site_id"
```

**成功响应示例**：
```json
{
  "success": true,
  "message": "Lazada orders API test successful",
  "data": {
    "siteId": "lazada_test_site",
    "connected": true,
    "lazadaCode": 0,
    "totalResults": 0,
    "ordersCount": 0,
    "hasOrders": false,
    "requestId": "1234567890",
    "timestamp": "2025-01-20T10:30:00.000Z"
  }
}
```

## 问题定位流程

### 1. 使用最小化测试程序定位问题

当遇到 `refresh_token` 无法获取的问题时，首先使用最小化测试程序：

```bash
# 1. 获取授权码
# 访问 Lazada 授权页面，完成授权后从回调 URL 中提取 code 参数

# 2. 运行最小化测试程序
node api/lazada_token_test.js --code=your_authorization_code
```

**测试程序会输出**：
- 环境变量检查结果
- 标准 OAuth2 端点的原始响应
- 签名版端点的原始响应（用于对比）
- 详细的字段分析
- 错误诊断和建议

### 2. 常见问题模式识别

#### 模式 1：响应中完全缺少 refresh_token
```
原始响应: {"access_token": "xxx", "expires_in": 10}
分析结果: hasRefreshToken: false
根本原因: 使用了错误的端点或配置问题
```

#### 模式 2：refresh_token 为空字符串
```
原始响应: {"access_token": "xxx", "refresh_token": "", "expires_in": 3600}
分析结果: hasRefreshToken: false (空字符串)
根本原因: redirect_uri 不匹配或授权码问题
```

#### 模式 3：expires_in 过短
```
原始响应: {"access_token": "xxx", "refresh_token": "xxx", "expires_in": 10}
分析结果: expiresIn: 10 (过短)
根本原因: 使用了签名版端点，获取的是短期令牌
```

### 3. 根据测试结果采取行动

#### 如果标准 OAuth2 端点成功
- ✅ 使用 `/api/lazada/oauth/callback-oauth2` 端点
- ✅ 确保回调处理使用标准 OAuth2 流程

#### 如果标准 OAuth2 端点失败
- ❌ 检查 `redirect_uri` 三处一致性
- ❌ 验证授权码是否有效
- ❌ 确认应用配置正确

#### 如果签名版端点也能获取 refresh_token
- ⚠️ 可能存在其他问题（如令牌有效期）
- ⚠️ 建议仍使用标准 OAuth2 端点

## 实际测试结果与解决方案

### 测试发现（2025-01-20）

通过实际测试发现：

1. **标准 OAuth2 端点问题**：
   - 端点 `https://auth.lazada.com/oauth/token` 返回 405 状态码
   - 可能是 Lazada 的 OAuth2 实现问题或端点配置问题

2. **签名版端点正常工作**：
   - 端点 `https://auth.lazada.com/rest/auth/token/create` 完全正常
   - 能够成功获取长期有效的 `refresh_token`（7天有效期）
   - 能够成功获取长期有效的 `access_token`（30天有效期）

3. **根本问题确认**：
   - 问题不在于端点选择，而在于令牌数据提取逻辑
   - `extractTokenPayload` 函数没有正确处理 Lazada 的直接 JSON 响应格式

### 解决方案

1. **继续使用签名版端点**：
   - 签名版端点工作正常，能够获取长期令牌
   - 无需切换到标准 OAuth2 端点

2. **修复令牌提取逻辑**：
   - 更新 `extractTokenPayload` 函数
   - 正确处理 Lazada 的直接 JSON 响应格式
   - 添加详细的调试日志

3. **验证修复效果**：
   - 重新测试授权流程
   - 确认能够成功获取并存储 `refresh_token`

## 调试技巧

### 1. 启用详细日志

在 OAuth 回调中添加详细日志：

```javascript
console.log('OAuth 回调调试信息:', {
  code: code ? `${code.substring(0, 10)}...` : null,
  state: state,
  redirectUri: redirectUri,
  timestamp: new Date().toISOString()
});
```

### 2. 检查原始响应

保存并检查 Lazada 的原始响应：

```javascript
const rawResponse = await response.text();
console.log('Lazada 原始响应:', rawResponse.substring(0, 500));
```

### 3. 使用 findKeyDeep 深度搜索

对于嵌套的响应结构，使用 `findKeyDeep` 工具：

```javascript
const { findKeyDeep } = require('../../../../lib/find-key-deep');

const refreshToken = findKeyDeep(payload, 'refresh_token', {
  maxDepth: 5,
  predicate: ({ value }) => {
    return typeof value === 'string' && value.trim().length > 0;
  }
});
```

## 部署检查清单

### 部署前检查

- [ ] 环境变量配置完整
- [ ] `redirect_uri` 三处一致
- [ ] 使用标准 OAuth2 端点
- [ ] 自检脚本通过
- [ ] 业务接口测试通过

### 部署后验证

- [ ] 手动走一遍完整授权流程
- [ ] 验证 `refresh_token` 成功获取并存储
- [ ] 测试令牌刷新功能
- [ ] 验证业务接口调用成功

## 最佳实践

1. **始终使用标准 OAuth2 流程**：避免混用签名版端点
2. **统一 redirect_uri 配置**：确保三处配置完全一致
3. **实现完整的错误处理**：包含详细的错误信息和诊断建议
4. **添加结构化日志**：便于问题排查和监控
5. **定期测试授权流程**：确保长期稳定性

## 相关文件

- `/api/lazada/oauth/start/index.js` - 授权启动端点
- `/api/lazada/oauth/callback-oauth2/index.js` - 标准 OAuth2 回调端点
- `/api/lazada/oauth/refresh/index.js` - 刷新令牌端点
- `/api/lazada/orders/test/index.js` - 业务接口测试端点
- `/api/lazada_token_test.js` - **最小化测试程序（推荐用于问题定位）**
- `/scripts/lazada-oauth-self-check.js` - 完整自检脚本
- `/lib/find-key-deep.js` - 深度搜索工具

## 更新日志

- **2025-01-20**：初始版本，包含完整的 OAuth2 实现和排错指南
- **2025-01-20**：添加一键自检脚本和业务接口测试
- **2025-01-20**：**重要发现** - 通过测试确认签名版端点能够正常获取长期 refresh_token
- **2025-01-20**：修复 `extractTokenPayload` 函数，正确处理 Lazada 的直接 JSON 响应格式
- **2025-01-20**：完善错误诊断和解决方案
