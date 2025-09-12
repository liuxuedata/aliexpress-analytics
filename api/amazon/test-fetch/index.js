// 测试不同的fetch实现
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    console.log('[Fetch Test] Testing different fetch implementations...');
    
    const tests = [];
    
    // 测试1: 使用node-fetch
    try {
      console.log('[Fetch Test] Testing with node-fetch...');
      const response = await fetch('https://api.amazon.com', {
        method: 'GET',
        timeout: 10000,
        headers: {
          'User-Agent': 'Amazon-SP-API-Client/1.0'
        }
      });
      
      tests.push({
        name: 'node-fetch to Amazon API',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'node-fetch working' : 'node-fetch failed'
      });
    } catch (error) {
      tests.push({
        name: 'node-fetch to Amazon API',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试2: 使用原生fetch
    try {
      console.log('[Fetch Test] Testing with native fetch...');
      const response = await globalThis.fetch('https://api.amazon.com', {
        method: 'GET',
        timeout: 10000,
        headers: {
          'User-Agent': 'Amazon-SP-API-Client/1.0'
        }
      });
      
      tests.push({
        name: 'native fetch to Amazon API',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'native fetch working' : 'native fetch failed'
      });
    } catch (error) {
      tests.push({
        name: 'native fetch to Amazon API',
        status: 'FAILED',
        error: error.message
      });
    }
    
    // 测试3: 测试SP-API端点
    try {
      console.log('[Fetch Test] Testing SP-API endpoint...');
      const response = await fetch('https://sellingpartnerapi-us-east-1.amazon.com/sellers/v1/marketplaceParticipations', {
        method: 'GET',
        timeout: 10000,
        headers: {
          'User-Agent': 'Amazon-SP-API-Client/1.0',
          'Accept': 'application/json'
        }
      });
      
      tests.push({
        name: 'SP-API endpoint test',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        statusCode: response.status,
        details: response.ok ? 'SP-API endpoint reachable' : 'SP-API endpoint not reachable'
      });
    } catch (error) {
      tests.push({
        name: 'SP-API endpoint test',
        status: 'FAILED',
        error: error.message
      });
    }
    
    return res.status(200).json({
      ok: true,
      message: 'Fetch implementation test completed',
      timestamp: new Date().toISOString(),
      tests: tests,
      summary: {
        totalTests: tests.length,
        passedTests: tests.filter(t => t.status === 'SUCCESS').length,
        failedTests: tests.filter(t => t.status === 'FAILED').length
      }
    });
    
  } catch (error) {
    console.error('[Fetch Test] Error:', error);
    return res.status(500).json({
      error: 'Fetch test failed',
      message: error.message,
      stack: error.stack
    });
  }
}
