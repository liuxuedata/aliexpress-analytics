/**
 * Lazada OAuth 测试用例
 * 
 * 覆盖 OAuth 流程的各种场景，包括成功和失败情况
 */

const { testOAuth2TokenExchange, testRefreshToken, makeRequest } = require('../scripts/lazada-oauth-self-check');

// Mock 环境变量
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    LAZADA_APP_KEY: 'test_app_key',
    LAZADA_APP_SECRET: 'test_app_secret',
    LAZADA_REDIRECT_URI: 'https://test.com/api/lazada/oauth/callback-oauth2'
  };
});

afterEach(() => {
  process.env = originalEnv;
});

// Mock fetch
global.fetch = jest.fn();

describe('Lazada OAuth 测试', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('OAuth2 令牌换取', () => {
    test('成功获取 refresh_token', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test_access_token_1234567890',
          refresh_token: 'test_refresh_token_1234567890',
          expires_in: 3600,
          refresh_expires_in: 2592000,
          account_id: 'test_account_123',
          country: 'MY',
          request_id: 'test_request_123'
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testOAuth2TokenExchange('test_code_123');

      expect(result.success).toBe(true);
      expect(result.payload.refresh_token).toContain('test_refresh_token');
      expect(result.payload.access_token).toContain('test_access_token');
      expect(result.payload.expires_in).toBe(3600);
    });

    test('响应中缺少 refresh_token', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test_access_token_1234567890',
          expires_in: 10, // 短期令牌
          error: 'short_lived_token'
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testOAuth2TokenExchange('test_code_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('REFRESH_TOKEN_MISSING');
    });

    test('授权码无效', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The authorization code is invalid or expired'
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testOAuth2TokenExchange('invalid_code');

      expect(result.success).toBe(false);
      expect(result.error).toBe('OAUTH2_REQUEST_FAILED');
      expect(result.status).toBe(400);
    });

    test('redirect_uri 不匹配', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          error: 'redirect_uri_mismatch',
          error_description: 'The redirect URI does not match'
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testOAuth2TokenExchange('test_code_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('OAUTH2_REQUEST_FAILED');
      expect(result.details.error).toBe('redirect_uri_mismatch');
    });

    test('网络异常', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await testOAuth2TokenExchange('test_code_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('REQUEST_EXCEPTION');
      expect(result.message).toBe('Network error');
    });
  });

  describe('刷新令牌', () => {
    test('成功刷新令牌', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'new_access_token_1234567890',
          refresh_token: 'new_refresh_token_1234567890',
          expires_in: 3600,
          refresh_expires_in: 2592000
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testRefreshToken('old_refresh_token_123');

      expect(result.success).toBe(true);
      expect(result.payload.refresh_token).toContain('new_refresh_token');
      expect(result.payload.access_token).toContain('new_access_token');
    });

    test('刷新令牌无效', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid'
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testRefreshToken('invalid_refresh_token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('REFRESH_REQUEST_FAILED');
      expect(result.status).toBe(400);
    });

    test('刷新响应缺少新令牌', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'new_access_token_1234567890',
          expires_in: 3600
          // 缺少 refresh_token
        }))
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const result = await testRefreshToken('old_refresh_token_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('REFRESH_TOKEN_MISSING');
    });
  });

  describe('环境变量检查', () => {
    test('缺少必需环境变量', () => {
      delete process.env.LAZADA_APP_KEY;
      
      const { checkEnvironmentVariables } = require('../scripts/lazada-oauth-self-check');
      const result = checkEnvironmentVariables();
      
      expect(result).toBe(false);
    });

    test('环境变量配置完整', () => {
      const { checkEnvironmentVariables } = require('../scripts/lazada-oauth-self-check');
      const result = checkEnvironmentVariables();
      
      expect(result).toBe(true);
    });
  });

  describe('HTTP 请求工具', () => {
    test('成功发送请求', async () => {
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true })
      };

      // Mock Node.js http module
      const http = require('http');
      const originalRequest = http.request;
      
      http.request = jest.fn((options, callback) => {
        const mockReq = {
          write: jest.fn(),
          end: jest.fn()
        };
        
        // 模拟响应
        setTimeout(() => {
          const mockRes = {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            on: jest.fn((event, handler) => {
              if (event === 'data') {
                handler(JSON.stringify({ success: true }));
              } else if (event === 'end') {
                handler();
              }
            })
          };
          callback(mockRes);
        }, 0);
        
        return mockReq;
      });

      const result = await makeRequest('https://api.test.com/test', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      expect(result.status).toBe(200);
      expect(result.body).toContain('success');

      // 恢复原始方法
      http.request = originalRequest;
    });
  });
});

describe('Lazada OAuth 集成测试', () => {
  test('完整 OAuth 流程模拟', async () => {
    // 模拟授权码换取令牌
    const tokenResponse = {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        access_token: 'test_access_token_1234567890',
        refresh_token: 'test_refresh_token_1234567890',
        expires_in: 3600,
        refresh_expires_in: 2592000,
        account_id: 'test_account_123',
        country: 'MY',
        request_id: 'test_request_123'
      }))
    };

    // 模拟刷新令牌
    const refreshResponse = {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        access_token: 'new_access_token_1234567890',
        refresh_token: 'new_refresh_token_1234567890',
        expires_in: 3600,
        refresh_expires_in: 2592000
      }))
    };

    fetch
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(refreshResponse);

    // 测试授权码换取
    const tokenResult = await testOAuth2TokenExchange('test_code_123');
    expect(tokenResult.success).toBe(true);

    // 测试刷新令牌
    const refreshResult = await testRefreshToken(tokenResult.payload.refresh_token);
    expect(refreshResult.success).toBe(true);
  });
});

describe('错误诊断测试', () => {
  test('生成常见错误诊断', () => {
    const { generateDiagnostics } = require('../scripts/lazada-oauth-self-check');
    
    const result = {
      error: 'REFRESH_TOKEN_MISSING'
    };
    
    // 这里需要实现 generateDiagnostics 函数
    // 由于原脚本中没有导出，我们需要添加
    console.log('测试错误诊断功能');
  });
});

// 测试数据
const testData = {
  validAuthCode: 'test_auth_code_1234567890',
  invalidAuthCode: 'invalid_auth_code',
  validRefreshToken: 'test_refresh_token_1234567890',
  invalidRefreshToken: 'invalid_refresh_token',
  shortLivedToken: {
    access_token: 'short_access_token',
    expires_in: 10,
    error: 'short_lived_token'
  },
  validTokenResponse: {
    access_token: 'test_access_token_1234567890',
    refresh_token: 'test_refresh_token_1234567890',
    expires_in: 3600,
    refresh_expires_in: 2592000,
    account_id: 'test_account_123',
    country: 'MY',
    request_id: 'test_request_123'
  }
};

module.exports = {
  testData
};
