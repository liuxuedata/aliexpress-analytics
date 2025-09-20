#!/usr/bin/env node

/**
 * Lazada API 生产环境升级脚本
 * 
 * 用于自动化 Lazada API 从测试环境升级到生产环境的过程
 * 包括环境检查、配置验证、功能测试等
 */

const https = require('https');
const { URL } = require('url');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
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

function logStep(step, message) {
  colorLog('cyan', `[STEP ${step}] ${message}`);
}

// 配置
const CONFIG = {
  BASE_URL: 'https://aliexpress-analytics.vercel.app',
  TIMEOUT: 30000,
  TEST_ENDPOINTS: [
    '/api/lazada/orders/test',
    '/api/lazada/stats',
    '/api/lazada/ads'
  ]
};

// 发送 HTTP 请求
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lazada-Production-Upgrade-Script/1.0',
        ...options.headers
      },
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

// 检查环境变量
function checkEnvironmentVariables() {
  logStep(1, '检查环境变量配置');
  
  const requiredVars = [
    'LAZADA_APP_KEY',
    'LAZADA_APP_SECRET',
    'LAZADA_REDIRECT_URI',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missing = [];
  const present = [];
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      present.push(varName);
      logSuccess(`${varName} 已配置`);
    } else {
      missing.push(varName);
      logError(`${varName} 未配置`);
    }
  }
  
  if (missing.length > 0) {
    logError(`缺少环境变量: ${missing.join(', ')}`);
    return false;
  }
  
  logSuccess('所有必需的环境变量已配置');
  return true;
}

// 测试 API 端点
async function testAPIEndpoint(endpoint, siteId = 'lazada_my_flagship') {
  try {
    const url = `${CONFIG.BASE_URL}${endpoint}?siteId=${siteId}`;
    logInfo(`测试端点: ${endpoint}`);
    
    const response = await makeRequest(url);
    
    if (response.status === 200) {
      logSuccess(`${endpoint} 测试成功 (${response.status})`);
      return { success: true, status: response.status, endpoint };
    } else {
      logWarning(`${endpoint} 返回状态码: ${response.status}`);
      return { success: false, status: response.status, endpoint, body: response.body };
    }
  } catch (error) {
    logError(`${endpoint} 测试失败: ${error.message}`);
    return { success: false, error: error.message, endpoint };
  }
}

// 测试所有 API 端点
async function testAllEndpoints() {
  logStep(2, '测试所有 Lazada API 端点');
  
  const results = [];
  
  for (const endpoint of CONFIG.TEST_ENDPOINTS) {
    const result = await testAPIEndpoint(endpoint);
    results.push(result);
    
    // 添加延迟避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  if (successCount === totalCount) {
    logSuccess(`所有 API 端点测试通过 (${successCount}/${totalCount})`);
    return true;
  } else {
    logWarning(`部分 API 端点测试失败 (${successCount}/${totalCount})`);
    return false;
  }
}

// 检查 OAuth 配置
async function checkOAuthConfig() {
  logStep(3, '检查 OAuth 配置');
  
  try {
    const url = `${CONFIG.BASE_URL}/api/lazada/oauth/start?siteId=lazada_my_flagship`;
    const response = await makeRequest(url);
    
    if (response.status === 200) {
      logSuccess('OAuth 配置正常');
      return true;
    } else {
      logError(`OAuth 配置检查失败: ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`OAuth 配置检查失败: ${error.message}`);
    return false;
  }
}

// 生成升级报告
function generateUpgradeReport(results) {
  logStep(4, '生成升级报告');
  
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      baseUrl: CONFIG.BASE_URL
    },
    checks: {
      environmentVariables: results.envCheck,
      apiEndpoints: results.apiTest,
      oauthConfig: results.oauthCheck
    },
    recommendations: []
  };
  
  // 生成建议
  if (!results.envCheck) {
    report.recommendations.push('配置缺失的环境变量');
  }
  
  if (!results.apiTest) {
    report.recommendations.push('修复 API 端点问题');
  }
  
  if (!results.oauthCheck) {
    report.recommendations.push('检查 OAuth 配置');
  }
  
  if (results.envCheck && results.apiTest && results.oauthCheck) {
    report.recommendations.push('系统已准备好升级到生产环境');
    report.recommendations.push('下一步：提交 Lazada 应用审核');
  }
  
  return report;
}

// 主函数
async function main() {
  console.log(colors.magenta + '='.repeat(60));
  console.log('🚀 Lazada API 生产环境升级检查');
  console.log('='.repeat(60) + colors.reset);
  
  const results = {
    envCheck: false,
    apiTest: false,
    oauthCheck: false
  };
  
  try {
    // 1. 检查环境变量
    results.envCheck = checkEnvironmentVariables();
    
    if (!results.envCheck) {
      logError('环境变量检查失败，请先配置必需的环境变量');
      process.exit(1);
    }
    
    // 2. 测试 API 端点
    results.apiTest = await testAllEndpoints();
    
    // 3. 检查 OAuth 配置
    results.oauthCheck = await checkOAuthConfig();
    
    // 4. 生成报告
    const report = generateUpgradeReport(results);
    
    console.log('\n' + colors.magenta + '='.repeat(60));
    console.log('📊 升级检查报告');
    console.log('='.repeat(60) + colors.reset);
    
    console.log(`时间: ${report.timestamp}`);
    console.log(`环境: ${report.environment.platform} (Node.js ${report.environment.nodeVersion})`);
    console.log(`基础 URL: ${report.environment.baseUrl}`);
    
    console.log('\n检查结果:');
    console.log(`  环境变量: ${results.envCheck ? '✅ 通过' : '❌ 失败'}`);
    console.log(`  API 端点: ${results.apiTest ? '✅ 通过' : '❌ 失败'}`);
    console.log(`  OAuth 配置: ${results.oauthCheck ? '✅ 通过' : '❌ 失败'}`);
    
    console.log('\n建议:');
    report.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });
    
    if (results.envCheck && results.apiTest && results.oauthCheck) {
      console.log('\n' + colors.green + '🎉 恭喜！系统已准备好升级到生产环境' + colors.reset);
      console.log('\n下一步操作:');
      console.log('1. 登录 Lazada Open Platform');
      console.log('2. 提交应用审核');
      console.log('3. 等待审核通过');
      console.log('4. 获取生产环境凭证');
      console.log('5. 更新环境变量');
      console.log('6. 重新部署应用');
    } else {
      console.log('\n' + colors.red + '❌ 系统尚未准备好升级，请先解决上述问题' + colors.reset);
      process.exit(1);
    }
    
  } catch (error) {
    logError(`升级检查失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    logError(`脚本执行失败: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  checkEnvironmentVariables,
  testAPIEndpoint,
  testAllEndpoints,
  checkOAuthConfig,
  generateUpgradeReport
};
