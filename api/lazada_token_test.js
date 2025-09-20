/**
 * Lazada Token API 最小化测试程序
 * 
 * 专门用于检查 Lazada OAuth token API 的原始响应
 * 定位 refresh_token 缺失的根本原因
 * 
 * 使用方法：
 * 1. 设置环境变量 LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_REDIRECT_URI
 * 2. 获取真实的 authorization_code
 * 3. 运行: node api/lazada_token_test.js --code=your_code
 */

const https = require('https');
const { URL } = require('url');

// 配置
const CONFIG = {
  // 标准 OAuth2 端点
  OAUTH_TOKEN_ENDPOINT: 'https://auth.lazada.com/oauth/token',
  // 签名版端点（用于对比）
  SIGNED_TOKEN_ENDPOINT: 'https://auth.lazada.com/rest/auth/token/create',
  TIMEOUT: 30000
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
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
  
  const required = ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET', 'LAZADA_REDIRECT_URI'];
  const missing = [];
  const present = {};
  
  for (const key of required) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      present[key] = key.includes('SECRET') ? `${value.substring(0, 8)}...` : value;
    }
  }
  
  if (missing.length > 0) {
    logError(`缺少环境变量: ${missing.join(', ')}`);
    return false;
  }
  
  logSuccess('环境变量检查通过');
  logDebug(`配置信息: ${JSON.stringify(present, null, 2)}`);
  return true;
}

// 发送 HTTP 请求
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');
    
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

// 测试标准 OAuth2 端点
async function testOAuth2Endpoint(code) {
  logInfo('=== 测试标准 OAuth2 端点 ===');
  logInfo(`端点: ${CONFIG.OAUTH_TOKEN_ENDPOINT}`);
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.LAZADA_APP_KEY,
    client_secret: process.env.LAZADA_APP_SECRET,
    code: code,
    redirect_uri: process.env.LAZADA_REDIRECT_URI
  });
  
  logDebug(`请求参数: ${params.toString().replace(/client_secret=[^&]+/, 'client_secret=***')}`);
  
  try {
    const response = await makeRequest(CONFIG.OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    
    logDebug(`响应状态: ${response.status}`);
    logDebug(`响应头: ${JSON.stringify(response.headers, null, 2)}`);
    
    // 打印原始响应
    logInfo('原始响应内容:');
    console.log('='.repeat(80));
    console.log(response.body);
    console.log('='.repeat(80));
    
    // 尝试解析 JSON
    let payload = null;
    try {
      payload = JSON.parse(response.body);
      logInfo('解析后的 JSON:');
      console.log(JSON.stringify(payload, null, 2));
    } catch (parseError) {
      logError(`JSON 解析失败: ${parseError.message}`);
      return { success: false, error: 'JSON_PARSE_ERROR', rawResponse: response.body };
    }
    
    // 分析响应内容
    if (!response.status || response.status >= 400) {
      logError(`OAuth2 请求失败: ${response.status}`);
      return { success: false, error: 'OAUTH2_REQUEST_FAILED', status: response.status, details: payload };
    }
    
    // 检查关键字段
    const analysis = {
      hasAccessToken: Boolean(payload.access_token),
      hasRefreshToken: Boolean(payload.refresh_token),
      expiresIn: payload.expires_in,
      refreshExpiresIn: payload.refresh_expires_in,
      accountId: payload.account_id,
      country: payload.country,
      requestId: payload.request_id,
      error: payload.error,
      errorDescription: payload.error_description
    };
    
    logInfo('响应字段分析:');
    console.log(JSON.stringify(analysis, null, 2));
    
    if (!analysis.hasRefreshToken) {
      logError('❌ 响应中缺少 refresh_token');
      logWarning('可能的原因:');
      logWarning('1. 使用了错误的端点 (应该使用 /oauth/token 而不是 /auth/token/create)');
      logWarning('2. redirect_uri 不匹配');
      logWarning('3. 授权码已过期或重复使用');
      logWarning('4. 应用配置问题');
      return { success: false, error: 'REFRESH_TOKEN_MISSING', analysis };
    }
    
    if (analysis.expiresIn && analysis.expiresIn < 3600) {
      logWarning(`⚠️  access_token 过期时间过短: ${analysis.expiresIn} 秒 (期望 >= 3600)`);
    }
    
    logSuccess('✅ OAuth2 端点测试成功，包含 refresh_token');
    return { success: true, analysis, payload };
    
  } catch (error) {
    logError(`OAuth2 请求异常: ${error.message}`);
    return { success: false, error: 'REQUEST_EXCEPTION', message: error.message };
  }
}

// 测试签名版端点（用于对比）
async function testSignedEndpoint(code) {
  logInfo('=== 测试签名版端点（对比） ===');
  logInfo(`端点: ${CONFIG.SIGNED_TOKEN_ENDPOINT}`);
  
  const crypto = require('crypto');
  const timestamp = Date.now().toString();
  const params = {
    app_key: process.env.LAZADA_APP_KEY,
    code: code,
    redirect_uri: process.env.LAZADA_REDIRECT_URI,
    sign_method: 'sha256',
    timestamp,
    need_refresh_token: 'true'
  };
  
  // 构建签名
  const TOKEN_PATH = '/auth/token/create';
  const sortedKeys = Object.keys(params).sort();
  let base = TOKEN_PATH;
  for (const key of sortedKeys) {
    base += key + params[key];
  }
  params.sign = crypto.createHmac('sha256', process.env.LAZADA_APP_SECRET).update(base).digest('hex').toUpperCase();
  
  const search = new URLSearchParams(params);
  const url = `${CONFIG.SIGNED_TOKEN_ENDPOINT}?${search.toString()}`;
  
  logDebug(`请求 URL: ${url.replace(/sign=[^&]+/, 'sign=***')}`);
  
  try {
    const response = await makeRequest(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    logDebug(`响应状态: ${response.status}`);
    
    // 打印原始响应
    logInfo('签名版端点原始响应:');
    console.log('='.repeat(80));
    console.log(response.body);
    console.log('='.repeat(80));
    
    let payload = null;
    try {
      payload = JSON.parse(response.body);
      logInfo('签名版端点解析后的 JSON:');
      console.log(JSON.stringify(payload, null, 2));
    } catch (parseError) {
      logError(`签名版端点 JSON 解析失败: ${parseError.message}`);
      return { success: false, error: 'JSON_PARSE_ERROR', rawResponse: response.body };
    }
    
    // 分析签名版响应
    const analysis = {
      hasAccessToken: Boolean(payload.access_token),
      hasRefreshToken: Boolean(payload.refresh_token),
      expiresIn: payload.expires_in,
      refreshExpiresIn: payload.refresh_expires_in,
      error: payload.error,
      errorDescription: payload.error_description
    };
    
    logInfo('签名版端点响应字段分析:');
    console.log(JSON.stringify(analysis, null, 2));
    
    if (!analysis.hasRefreshToken) {
      logError('❌ 签名版端点响应中也缺少 refresh_token');
      logWarning('这证实了签名版端点的问题');
    } else {
      logSuccess('✅ 签名版端点包含 refresh_token');
    }
    
    return { success: response.status < 400, analysis, payload };
    
  } catch (error) {
    logError(`签名版端点请求异常: ${error.message}`);
    return { success: false, error: 'REQUEST_EXCEPTION', message: error.message };
  }
}

// 主函数
async function main() {
  console.log('🔍 Lazada Token API 最小化测试程序');
  console.log('=====================================\n');
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  const code = args.find(arg => arg.startsWith('--code='))?.split('=')[1];
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('用法: node api/lazada_token_test.js [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --code=<授权码>    测试指定的授权码');
    console.log('  --help, -h        显示帮助信息');
    console.log('');
    console.log('环境变量:');
    console.log('  LAZADA_APP_KEY            Lazada 应用密钥');
    console.log('  LAZADA_APP_SECRET         Lazada 应用密钥');
    console.log('  LAZADA_REDIRECT_URI       Lazada 回调地址');
    console.log('');
    console.log('示例:');
    console.log('  node api/lazada_token_test.js --code=abc123');
    return;
  }
  
  // 检查环境变量
  if (!checkEnvironmentVariables()) {
    process.exit(1);
  }
  
  if (!code) {
    logError('请提供授权码: --code=your_authorization_code');
    logInfo('获取授权码的方法:');
    logInfo('1. 访问 Lazada 授权页面');
    logInfo('2. 完成授权后，从回调 URL 中提取 code 参数');
    logInfo('3. 使用该 code 运行此测试程序');
    process.exit(1);
  }
  
  console.log('');
  
  // 测试标准 OAuth2 端点
  const oauth2Result = await testOAuth2Endpoint(code);
  
  console.log('\n');
  
  // 测试签名版端点（用于对比）
  const signedResult = await testSignedEndpoint(code);
  
  console.log('\n');
  
  // 总结
  logInfo('=== 测试总结 ===');
  
  if (oauth2Result.success) {
    logSuccess('✅ 标准 OAuth2 端点测试通过，成功获取 refresh_token');
  } else {
    logError('❌ 标准 OAuth2 端点测试失败');
    if (oauth2Result.error === 'REFRESH_TOKEN_MISSING') {
      logError('根本原因: 响应中缺少 refresh_token');
    }
  }
  
  if (signedResult.success) {
    logWarning('⚠️  签名版端点也能获取 refresh_token，但可能存在其他问题');
  } else {
    logInfo('ℹ️  签名版端点测试失败，这可能是正常的');
  }
  
  // 给出建议
  console.log('\n');
  logInfo('=== 建议 ===');
  
  if (oauth2Result.success) {
    logSuccess('建议使用标准 OAuth2 端点: https://auth.lazada.com/oauth/token');
    logInfo('确保在回调处理中使用此端点');
  } else {
    logError('需要检查以下配置:');
    logError('1. redirect_uri 是否与 Lazada 应用配置完全一致');
    logError('2. 授权码是否有效且未重复使用');
    logError('3. 应用密钥是否正确');
    logError('4. 是否使用了正确的端点');
  }
}

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    logError(`程序执行异常: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  testOAuth2Endpoint,
  testSignedEndpoint,
  makeRequest
};
