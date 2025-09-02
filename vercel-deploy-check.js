// vercel-deploy-check.js
// 检查Vercel部署状态的脚本

const https = require('https');

const BASE_URL = 'https://aliexpress-analytics-git-new-site-a-f19fel-liuxuedatas-projects.vercel.app';

const endpoints = [
  '/api/health',
  '/api/test',
  '/api/site-configs',
  '/api/data-source-templates',
  '/api/dynamic-ingest/test'
];

function checkEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`检查端点: ${url}`);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`状态: ${res.statusCode}`);
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.log('响应: JSON格式正确');
            resolve({ endpoint, status: res.statusCode, ok: true });
          } catch (e) {
            console.log('响应: 非JSON格式');
            resolve({ endpoint, status: res.statusCode, ok: false, error: '非JSON格式' });
          }
        } else {
          console.log('响应: 错误状态码');
          resolve({ endpoint, status: res.statusCode, ok: false, error: 'HTTP错误' });
        }
      });
    }).on('error', (err) => {
      console.log(`错误: ${err.message}`);
      resolve({ endpoint, status: 0, ok: false, error: err.message });
    });
  });
}

async function checkAllEndpoints() {
  console.log('开始检查Vercel部署状态...\n');
  
  const results = [];
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    results.push(result);
    console.log('---\n');
  }
  
  console.log('检查结果汇总:');
  results.forEach(result => {
    const status = result.ok ? '✅ 正常' : '❌ 失败';
    console.log(`${result.endpoint}: ${status} (${result.status})`);
  });
  
  const workingCount = results.filter(r => r.ok).length;
  console.log(`\n总计: ${workingCount}/${results.length} 个端点正常工作`);
}

checkAllEndpoints().catch(console.error);
