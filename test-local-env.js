#!/usr/bin/env node

/**
 * 测试本地环境配置
 * 验证Amazon SP-API和Supabase连接
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// 配置
const CONFIG = {
  clientId: process.env.AMZ_LWA_CLIENT_ID,
  clientSecret: process.env.AMZ_LWA_CLIENT_SECRET,
  refreshToken: process.env.AMZ_SP_REFRESH_TOKEN,
  appRegion: process.env.AMZ_APP_REGION || 'us-east-1',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  syncUrl: process.env.SYNC_URL || 'https://your-domain.vercel.app/api/amazon/local-sync',
};

async function testEnvironment() {
  console.log('🧪 测试本地环境配置...\n');
  
  const tests = [];
  
  // 测试1: 环境变量检查
  console.log('1️⃣ 检查环境变量...');
  const requiredVars = [
    'AMZ_LWA_CLIENT_ID',
    'AMZ_LWA_CLIENT_SECRET',
    'AMZ_SP_REFRESH_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    tests.push({
      name: '环境变量检查',
      status: 'FAILED',
      error: `缺少变量: ${missingVars.join(', ')}`
    });
    console.log('❌ 环境变量检查失败');
  } else {
    tests.push({
      name: '环境变量检查',
      status: 'SUCCESS',
      details: '所有必需的环境变量都已设置'
    });
    console.log('✅ 环境变量检查通过');
  }
  
  // 测试2: LWA认证
  console.log('\n2️⃣ 测试LWA认证...');
  try {
    const authResponse = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: CONFIG.refreshToken,
        client_id: CONFIG.clientId,
        client_secret: CONFIG.clientSecret,
      }),
    });
    
    if (authResponse.ok) {
      const authData = await authResponse.json();
      tests.push({
        name: 'LWA认证',
        status: 'SUCCESS',
        details: 'LWA认证成功',
        expiresIn: authData.expires_in
      });
      console.log('✅ LWA认证成功');
    } else {
      const errorText = await authResponse.text();
      tests.push({
        name: 'LWA认证',
        status: 'FAILED',
        error: `认证失败: ${authResponse.status} ${errorText}`
      });
      console.log('❌ LWA认证失败');
    }
  } catch (error) {
    tests.push({
      name: 'LWA认证',
      status: 'FAILED',
      error: error.message
    });
    console.log('❌ LWA认证错误:', error.message);
  }
  
  // 测试3: Supabase连接
  console.log('\n3️⃣ 测试Supabase连接...');
  try {
    const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
    
    const { data, error } = await supabase
      .from('amazon_daily_by_asin')
      .select('count')
      .limit(1);
    
    if (error) {
      tests.push({
        name: 'Supabase连接',
        status: 'FAILED',
        error: error.message
      });
      console.log('❌ Supabase连接失败:', error.message);
    } else {
      tests.push({
        name: 'Supabase连接',
        status: 'SUCCESS',
        details: 'Supabase连接成功'
      });
      console.log('✅ Supabase连接成功');
    }
  } catch (error) {
    tests.push({
      name: 'Supabase连接',
      status: 'FAILED',
      error: error.message
    });
    console.log('❌ Supabase连接错误:', error.message);
  }
  
  // 测试4: 云端同步端点
  console.log('\n4️⃣ 测试云端同步端点...');
  try {
    const response = await fetch(CONFIG.syncUrl, {
      method: 'GET',
    });
    
    if (response.ok) {
      const data = await response.json();
      tests.push({
        name: '云端同步端点',
        status: 'SUCCESS',
        details: '云端同步端点可访问'
      });
      console.log('✅ 云端同步端点可访问');
    } else {
      tests.push({
        name: '云端同步端点',
        status: 'FAILED',
        error: `端点不可访问: ${response.status}`
      });
      console.log('❌ 云端同步端点不可访问');
    }
  } catch (error) {
    tests.push({
      name: '云端同步端点',
      status: 'FAILED',
      error: error.message
    });
    console.log('❌ 云端同步端点错误:', error.message);
  }
  
  // 测试5: SP-API端点连接
  console.log('\n5️⃣ 测试SP-API端点连接...');
  try {
    const response = await fetch(`https://sellingpartnerapi-${CONFIG.appRegion}.amazon.com`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Amazon-SP-API-Client/1.0'
      }
    });
    
    if (response.ok) {
      tests.push({
        name: 'SP-API端点连接',
        status: 'SUCCESS',
        details: 'SP-API端点可访问'
      });
      console.log('✅ SP-API端点可访问');
    } else {
      tests.push({
        name: 'SP-API端点连接',
        status: 'FAILED',
        error: `端点不可访问: ${response.status}`
      });
      console.log('❌ SP-API端点不可访问');
    }
  } catch (error) {
    tests.push({
      name: 'SP-API端点连接',
      status: 'FAILED',
      error: error.message
    });
    console.log('❌ SP-API端点连接错误:', error.message);
  }
  
  // 输出测试结果
  console.log('\n📊 测试结果总结:');
  console.log('='.repeat(50));
  
  tests.forEach((test, index) => {
    const status = test.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${test.name}`);
    if (test.details) {
      console.log(`   详情: ${test.details}`);
    }
    if (test.error) {
      console.log(`   错误: ${test.error}`);
    }
  });
  
  const successCount = tests.filter(t => t.status === 'SUCCESS').length;
  const totalCount = tests.length;
  
  console.log('\n' + '='.repeat(50));
  console.log(`总计: ${successCount}/${totalCount} 测试通过`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！可以运行数据拉取脚本。');
    console.log('运行命令: node amazon-local-puller.js');
  } else {
    console.log('⚠️  部分测试失败，请检查配置后重试。');
  }
  
  return tests;
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnvironment().catch(console.error);
}

export default testEnvironment;
