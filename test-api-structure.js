// test-api-structure.js
// 测试API文件结构是否正确

const fs = require('fs');
const path = require('path');

function checkApiStructure() {
  console.log('检查API文件结构...\n');
  
  const apiDir = './api';
  const requiredApis = [
    'health.js',
    'test.js',
    'site-configs/index.js',
    'site-configs/[id].js',
    'data-source-templates/index.js',
    'dynamic-ingest/[siteId].js',
    'dynamic-ingest/[siteId]/generate-test-data.js'
  ];
  
  const missingApis = [];
  const existingApis = [];
  
  requiredApis.forEach(apiPath => {
    const fullPath = path.join(apiDir, apiPath);
    if (fs.existsSync(fullPath)) {
      existingApis.push(apiPath);
      console.log(`✅ ${apiPath}`);
    } else {
      missingApis.push(apiPath);
      console.log(`❌ ${apiPath} - 缺失`);
    }
  });
  
  console.log('\n=== 检查结果 ===');
  console.log(`存在的API: ${existingApis.length}/${requiredApis.length}`);
  console.log(`缺失的API: ${missingApis.length}`);
  
  if (missingApis.length > 0) {
    console.log('\n缺失的API文件:');
    missingApis.forEach(api => console.log(`  - ${api}`));
  }
  
  // 检查所有API文件
  console.log('\n=== 所有API文件 ===');
  function listFiles(dir, prefix = '') {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        console.log(`${prefix}📁 ${item}/`);
        listFiles(fullPath, prefix + '  ');
      } else {
        console.log(`${prefix}📄 ${item}`);
      }
    });
  }
  
  listFiles(apiDir);
}

checkApiStructure();
