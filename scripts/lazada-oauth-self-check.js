#!/usr/bin/env node

/**
 * Lazada OAuth 一键自检脚本
 * 
 * 用于验证后端能否正确获取 refresh_token
 * 仅在服务端执行，使用 curl 或 fetch 向 Lazada OAuth 端点发起请求
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 配置
const CONFIG = {
  LAZADA_OAUTH_ENDPOINT: 'https://auth.lazada.com/oauth/token',
  TIMEOUT: 30000, // 30秒超时
  MIN_EXPIRES_IN: 3600, // 最小过期时间1小时
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logInfo(message) {
  colorLog('blue', `[INFO] ${message}`);
}

function logSuccess(message) {
  colorLog('green', `[SUCCESS] ${message}`);
}

function logWarning(message) {
  colorLog('yellow', `[WARNING] ${message}`);
}

function logError(message) {
  colorLog('red', `[ERROR] ${message}`);
}

function logDebug(message) {
  colorLog('cyan', `[DEBUG] ${message}`);
}

// 检查环境变量
function checkEnvironmentVariables() {
  logInfo('检查环境变量...');
  
  const required = [
    'LAZADA_APP_KEY',
    'LAZADA_APP_SECRET',
    'LAZADA_REDIRECT_URI'
  ];
  
  const missing = [];
  const present = {};
  
  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      present[key] = value.length > 10 ? `${value.substring(0, 10)}...` : value;
    }
  }
  
  if (missing.length > 0) {
    logError(`缺少环境变量: ${missing.join(', ')}`);
    return false;
  }
  
  logSuccess('环境变量检查通过');
  logDebug(`已配置变量: ${JSON.stringify(present, null, 2)}`);
  return true;
}

// 发送 HTTP 请求
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: CONFIG.TIMEOUT
    };
    
    const req = httpModule.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// 测试 OAuth2 授权码换取令牌
async function testOAuth2TokenExchange(code) {
  logInfo('测试 OAuth2 授权码换取令牌...');
  
  if (!code) {
    logWarning('未提供授权码，跳过令牌换取测试');
    return null;
  }
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.LAZADA_APP_KEY,
    client_secret: process.env.LAZADA_APP_SECRET,
    code: code,
    redirect_uri: process.env.LAZADA_REDIRECT_URI
  });
  
  try {
    const response = await makeRequest(CONFIG.LAZADA_OAUTH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    
    logDebug(`响应状态: ${response.status}`);
    logDebug(`响应头: ${JSON.stringify(response.headers, null, 2)}`);
    
    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch (parseError) {
      logError(`JSON 解析失败: ${parseError.message}`);
      logDebug(`原始响应: ${response.body.substring(0, 500)}`);
      return { success: false, error: 'JSON_PARSE_ERROR', rawResponse: response.body };
    }
    
    if (!response.status || response.status >= 400) {
      logError(`OAuth2 请求失败: ${response.status}`);
      logDebug(`错误响应: ${JSON.stringify(payload, null, 2)}`);
      return { success: false, error: 'OAUTH2_REQUEST_FAILED', status: response.status, details: payload };
    }
    
    // 检查关键字段
    const hasRefreshToken = Boolean(payload.refresh_token);
    const hasAccessToken = Boolean(payload.access_token);
    const expiresIn = Number(payload.expires_in);
    const isValidExpiresIn = Number.isFinite(expiresIn) && expiresIn >= CONFIG.MIN_EXPIRES_IN;
    
    logDebug(`响应字段检查:`);
    logDebug(`  - refresh_token: ${hasRefreshToken ? '✓' : '✗'}`);
    logDebug(`  - access_token: ${hasAccessToken ? '✓' : '✗'}`);
    logDebug(`  - expires_in: ${expiresIn} (${isValidExpiresIn ? '✓' : '✗'})`);
    
    if (!hasRefreshToken) {
      logError('❌ 响应中缺少 refresh_token');
      return { success: false, error: 'REFRESH_TOKEN_MISSING', details: payload };
    }
    
    if (!isValidExpiresIn) {
      logWarning(`⚠️  expires_in 值异常: ${expiresIn} (期望 >= ${CONFIG.MIN_EXPIRES_IN})`);
    }
    
    // 脱敏输出
    const sanitizedPayload = {
      access_token: payload.access_token ? `${payload.access_token.substring(0, 10)}...` : null,
      refresh_token: payload.refresh_token ? `${payload.refresh_token.substring(0, 10)}...` : null,
      expires_in: payload.expires_in,
      refresh_expires_in: payload.refresh_expires_in,
      account_id: payload.account_id,
      country: payload.country,
      request_id: payload.request_id,
      account_platform: payload.account_platform
    };
    
    logSuccess('✅ OAuth2 令牌换取成功');
    logDebug(`脱敏响应: ${JSON.stringify(sanitizedPayload, null, 2)}`);
    
    return { success: true, payload: sanitizedPayload, rawPayload: payload };
    
  } catch (error) {
    logError(`OAuth2 请求异常: ${error.message}`);
    return { success: false, error: 'REQUEST_EXCEPTION', message: error.message };
  }
}

// 测试刷新令牌
async function testRefreshToken(refreshToken) {
  logInfo('测试刷新令牌...');
  
  if (!refreshToken) {
    logWarning('未提供刷新令牌，跳过刷新测试');
    return null;
  }
  
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.LAZADA_APP_KEY,
    client_secret: process.env.LAZADA_APP_SECRET,
    refresh_token: refreshToken,
    redirect_uri: process.env.LAZADA_REDIRECT_URI
  });
  
  try {
    const response = await makeRequest(CONFIG.LAZADA_OAUTH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    
    logDebug(`刷新响应状态: ${response.status}`);
    
    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch (parseError) {
      logError(`刷新令牌 JSON 解析失败: ${parseError.message}`);
      return { success: false, error: 'JSON_PARSE_ERROR', rawResponse: response.body };
    }
    
    if (!response.status || response.status >= 400) {
      logError(`刷新令牌请求失败: ${response.status}`);
      return { success: false, error: 'REFRESH_REQUEST_FAILED', status: response.status, details: payload };
    }
    
    const hasNewRefreshToken = Boolean(payload.refresh_token);
    const hasAccessToken = Boolean(payload.access_token);
    
    if (!hasNewRefreshToken) {
      logError('❌ 刷新响应中缺少 refresh_token');
      return { success: false, error: 'REFRESH_TOKEN_MISSING', details: payload };
    }
    
    logSuccess('✅ 刷新令牌成功');
    
    const sanitizedPayload = {
      access_token: payload.access_token ? `${payload.access_token.substring(0, 10)}...` : null,
      refresh_token: payload.refresh_token ? `${payload.refresh_token.substring(0, 10)}...` : null,
      expires_in: payload.expires_in,
      refresh_expires_in: payload.refresh_expires_in
    };
    
    logDebug(`刷新脱敏响应: ${JSON.stringify(sanitizedPayload, null, 2)}`);
    
    return { success: true, payload: sanitizedPayload };
    
  } catch (error) {
    logError(`刷新令牌请求异常: ${error.message}`);
    return { success: false, error: 'REFRESH_EXCEPTION', message: error.message };
  }
}

// 生成常见错误诊断
function generateDiagnostics(result) {
  logInfo('生成诊断建议...');
  
  const diagnostics = [];
  
  if (result && result.error) {
    switch (result.error) {
      case 'REFRESH_TOKEN_MISSING':
        diagnostics.push('🔍 最可能原因:');
        diagnostics.push('  1. redirect_uri 三处不一致 (应用配置、authorize 链接、token 请求体)');
        diagnostics.push('  2. 重复使用 code (授权码只能使用一次)');
        diagnostics.push('  3. POST 形态/Content-Type 不正确');
        diagnostics.push('  4. 非卖家账号授权/错误环境');
        diagnostics.push('  5. 在 OAuth 步骤里误用了签名版口子');
        break;
        
      case 'OAUTH2_REQUEST_FAILED':
        diagnostics.push('🔍 请求失败可能原因:');
        diagnostics.push('  1. 授权码已过期或无效');
        diagnostics.push('  2. 应用配置错误 (client_id/client_secret)');
        diagnostics.push('  3. redirect_uri 不匹配');
        break;
        
      case 'REQUEST_EXCEPTION':
        diagnostics.push('🔍 网络异常可能原因:');
        diagnostics.push('  1. 网络连接问题');
        diagnostics.push('  2. Lazada 服务暂时不可用');
        diagnostics.push('  3. 防火墙或代理设置');
        break;
    }
  }
  
  if (diagnostics.length > 0) {
    diagnostics.forEach(diag => logWarning(diag));
  }
}

// 主函数
async function main() {
  console.log('🚀 Lazada OAuth 一键自检脚本');
  console.log('=====================================\n');
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  const code = args.find(arg => arg.startsWith('--code='))?.split('=')[1];
  const refreshToken = args.find(arg => arg.startsWith('--refresh-token='))?.split('=')[1];
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('用法: node lazada-oauth-self-check.js [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --code=<授权码>           测试授权码换取令牌');
    console.log('  --refresh-token=<令牌>    测试刷新令牌');
    console.log('  --help, -h               显示帮助信息');
    console.log('');
    console.log('环境变量:');
    console.log('  LAZADA_APP_KEY            Lazada 应用密钥');
    console.log('  LAZADA_APP_SECRET         Lazada 应用密钥');
    console.log('  LAZADA_REDIRECT_URI       Lazada 回调地址');
    console.log('');
    console.log('示例:');
    console.log('  node lazada-oauth-self-check.js --code=abc123');
    console.log('  node lazada-oauth-self-check.js --refresh-token=xyz789');
    return;
  }
  
  // 检查环境变量
  if (!checkEnvironmentVariables()) {
    process.exit(1);
  }
  
  console.log('');
  
  let overallSuccess = true;
  
  // 测试授权码换取令牌
  if (code) {
    const result = await testOAuth2TokenExchange(code);
    if (result && !result.success) {
      overallSuccess = false;
      generateDiagnostics(result);
    }
    console.log('');
  }
  
  // 测试刷新令牌
  if (refreshToken) {
    const result = await testRefreshToken(refreshToken);
    if (result && !result.success) {
      overallSuccess = false;
      generateDiagnostics(result);
    }
    console.log('');
  }
  
  // 总结
  if (overallSuccess) {
    logSuccess('🎉 所有测试通过！');
  } else {
    logError('❌ 部分测试失败，请检查上述诊断建议');
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    logError(`脚本执行异常: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  checkEnvironmentVariables,
  testOAuth2TokenExchange,
  testRefreshToken,
  makeRequest
};
