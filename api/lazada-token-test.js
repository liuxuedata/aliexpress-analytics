/**
 * Lazada Token API 测试端点
 * 
 * 作为 Vercel Serverless Function 运行
 * 专门用于检查 Lazada OAuth token API 的原始响应
 * 定位 refresh_token 缺失的根本原因
 * 
 * 使用方法：
 * GET /api/lazada-token-test?code=your_authorization_code
 */

const https = require('https');
const { URL } = require('url');

// 配置
const CONFIG = {
  OAUTH_TOKEN_ENDPOINT: 'https://auth.lazada.com/oauth/token',
  SIGNED_TOKEN_ENDPOINT: 'https://auth.lazada.com/rest/auth/token/create',
  TIMEOUT: 30000
};

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
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.LAZADA_APP_KEY,
    client_secret: process.env.LAZADA_APP_SECRET,
    code: code,
    redirect_uri: process.env.LAZADA_REDIRECT_URI
  });
  
  try {
    const response = await makeRequest(CONFIG.OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    
    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch (parseError) {
      return { 
        success: false, 
        error: 'JSON_PARSE_ERROR', 
        rawResponse: response.body,
        status: response.status
      };
    }
    
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
    
    return {
      success: response.status < 400,
      status: response.status,
      analysis,
      payload,
      rawResponse: response.body
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: 'REQUEST_EXCEPTION', 
      message: error.message 
    };
  }
}

// 测试签名版端点
async function testSignedEndpoint(code) {
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
  
  try {
    const response = await makeRequest(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch (parseError) {
      return { 
        success: false, 
        error: 'JSON_PARSE_ERROR', 
        rawResponse: response.body,
        status: response.status
      };
    }
    
    const analysis = {
      hasAccessToken: Boolean(payload.access_token),
      hasRefreshToken: Boolean(payload.refresh_token),
      expiresIn: payload.expires_in,
      refreshExpiresIn: payload.refresh_expires_in,
      error: payload.error,
      errorDescription: payload.error_description
    };
    
    return {
      success: response.status < 400,
      status: response.status,
      analysis,
      payload,
      rawResponse: response.body
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: 'REQUEST_EXCEPTION', 
      message: error.message 
    };
  }
}

// 检查环境变量
function checkEnvironmentVariables() {
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
  
  return {
    valid: missing.length === 0,
    missing,
    present
  };
}

// 主处理函数
async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }
  
  try {
    const { code } = req.query || {};
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Missing code parameter',
        usage: 'GET /api/lazada-token-test?code=your_authorization_code'
      });
    }
    
    // 检查环境变量
    const envCheck = checkEnvironmentVariables();
    if (!envCheck.valid) {
      return res.status(500).json({
        success: false,
        message: 'Environment variables not configured',
        missing: envCheck.missing,
        present: envCheck.present
      });
    }
    
    // 测试标准 OAuth2 端点
    const oauth2Result = await testOAuth2Endpoint(code);
    
    // 测试签名版端点
    const signedResult = await testSignedEndpoint(code);
    
    // 生成诊断建议
    const diagnostics = [];
    
    if (!oauth2Result.success) {
      if (oauth2Result.analysis && !oauth2Result.analysis.hasRefreshToken) {
        diagnostics.push('❌ 标准 OAuth2 端点响应中缺少 refresh_token');
        diagnostics.push('可能原因:');
        diagnostics.push('1. redirect_uri 不匹配');
        diagnostics.push('2. 授权码已过期或重复使用');
        diagnostics.push('3. 应用配置问题');
      }
    }
    
    if (signedResult.success && signedResult.analysis && signedResult.analysis.hasRefreshToken) {
      diagnostics.push('⚠️ 签名版端点能获取 refresh_token，但可能存在其他问题');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Lazada Token API 测试完成',
      timestamp: new Date().toISOString(),
      environment: {
        valid: envCheck.valid,
        present: envCheck.present
      },
      oauth2Endpoint: {
        endpoint: CONFIG.OAUTH_TOKEN_ENDPOINT,
        result: oauth2Result
      },
      signedEndpoint: {
        endpoint: CONFIG.SIGNED_TOKEN_ENDPOINT,
        result: signedResult
      },
      diagnostics,
      recommendations: [
        oauth2Result.success ? '✅ 建议使用标准 OAuth2 端点' : '❌ 需要检查 OAuth2 端点配置',
        '确保 redirect_uri 三处一致',
        '使用 /api/lazada/oauth/callback-oauth2 作为回调端点'
      ]
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = handler;
