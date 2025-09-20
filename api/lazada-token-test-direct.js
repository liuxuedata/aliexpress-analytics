/**
 * Lazada Token API 直接测试端点
 * 
 * 使用固定的配置进行测试，不依赖环境变量
 * 专门用于检查 Lazada OAuth token API 的原始响应
 */

const https = require('https');
const { URL } = require('url');

// 固定配置（用于测试）
const TEST_CONFIG = {
  OAUTH_TOKEN_ENDPOINT: 'https://auth.lazada.com/oauth/token',
  SIGNED_TOKEN_ENDPOINT: 'https://auth.lazada.com/rest/auth/token/create',
  TIMEOUT: 30000,
  // 使用您提供的回调地址
  REDIRECT_URI: 'https://aliexpress-analytics.vercel.app/api/lazada/oauth/callback'
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
      timeout: TEST_CONFIG.TIMEOUT
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
async function testOAuth2Endpoint(code, appKey, appSecret) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appKey,
    client_secret: appSecret,
    code: code,
    redirect_uri: TEST_CONFIG.REDIRECT_URI
  });
  
  try {
    const response = await makeRequest(TEST_CONFIG.OAUTH_TOKEN_ENDPOINT, {
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
async function testSignedEndpoint(code, appKey, appSecret) {
  const crypto = require('crypto');
  const timestamp = Date.now().toString();
  const params = {
    app_key: appKey,
    code: code,
    redirect_uri: TEST_CONFIG.REDIRECT_URI,
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
  params.sign = crypto.createHmac('sha256', appSecret).update(base).digest('hex').toUpperCase();
  
  const search = new URLSearchParams(params);
  const url = `${TEST_CONFIG.SIGNED_TOKEN_ENDPOINT}?${search.toString()}`;
  
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
    const { code, appKey, appSecret } = req.query || {};
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Missing code parameter',
        usage: 'GET /api/lazada-token-test-direct?code=your_code&appKey=your_key&appSecret=your_secret'
      });
    }
    
    if (!appKey || !appSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing appKey or appSecret parameter',
        usage: 'GET /api/lazada-token-test-direct?code=your_code&appKey=your_key&appSecret=your_secret'
      });
    }
    
    // 测试标准 OAuth2 端点
    const oauth2Result = await testOAuth2Endpoint(code, appKey, appSecret);
    
    // 测试签名版端点
    const signedResult = await testSignedEndpoint(code, appKey, appSecret);
    
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
    } else {
      diagnostics.push('✅ 标准 OAuth2 端点测试成功');
    }
    
    if (signedResult.success && signedResult.analysis && signedResult.analysis.hasRefreshToken) {
      diagnostics.push('⚠️ 签名版端点能获取 refresh_token');
    } else {
      diagnostics.push('❌ 签名版端点无法获取 refresh_token');
    }
    
    return res.status(200).json({
      success: true,
      message: 'Lazada Token API 直接测试完成',
      timestamp: new Date().toISOString(),
      config: {
        redirectUri: TEST_CONFIG.REDIRECT_URI,
        oauth2Endpoint: TEST_CONFIG.OAUTH_TOKEN_ENDPOINT,
        signedEndpoint: TEST_CONFIG.SIGNED_TOKEN_ENDPOINT
      },
      oauth2Endpoint: {
        endpoint: TEST_CONFIG.OAUTH_TOKEN_ENDPOINT,
        result: oauth2Result
      },
      signedEndpoint: {
        endpoint: TEST_CONFIG.SIGNED_TOKEN_ENDPOINT,
        result: signedResult
      },
      diagnostics,
      recommendations: [
        oauth2Result.success ? '✅ 建议使用标准 OAuth2 端点' : '❌ 需要检查 OAuth2 端点配置',
        '当前使用回调地址: ' + TEST_CONFIG.REDIRECT_URI,
        '建议更新为: https://aliexpress-analytics.vercel.app/api/lazada/oauth/callback-oauth2'
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
