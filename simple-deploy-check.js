// simple-deploy-check.js
// 简单的部署检查脚本

const https = require('https');

const BASE_URL = 'https://aliexpress-analytics-git-new-site-a-f19fel-liuxuedatas-projects.vercel.app';

function checkEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${endpoint}`;
    console.log(`检查: ${endpoint}`);
    
    const req = https.get(url, { timeout: 10000 }, (res) => {
      console.log(`  状态: ${res.statusCode}`);
      resolve({ endpoint, status: res.statusCode, ok: res.statusCode === 200 });
    });
    
    req.on('error', (err) => {
      console.log(`  错误: ${err.message}`);
      resolve({ endpoint, status: 0, ok: false, error: err.message });
    });
    
    req.on('timeout', () => {
      console.log(`  超时`);
      req.destroy();
      resolve({ endpoint, status: 0, ok: false, error: 'timeout' });
    });
  });
}

async function main() {
  console.log('开始检查Vercel部署状态...\n');
  
  const endpoints = [
    '/api/health',
    '/api/test',
    '/api/site-configs',
    '/api/data-source-templates'
  ];
  
  for (const endpoint of endpoints) {
    const result = await checkEndpoint(endpoint);
    console.log(`  ${result.ok ? '✅' : '❌'} ${result.status}\n`);
  }
  
  console.log('检查完成！');
}

main().catch(console.error);
