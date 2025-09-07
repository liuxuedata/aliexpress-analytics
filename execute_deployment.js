// 执行Facebook Ads显示优化部署
const { execSync } = require('child_process');

console.log('🚀 开始Facebook Ads显示优化部署...');

try {
  // 添加所有优化文件
  execSync('git add optimize_facebook_ads_display.js facebook_ads_optimization_patch.js manual_optimization_steps.md apply_facebook_ads_optimization.js quick_fix.js deployment_instructions.md optimize_and_deploy.md public/independent-site-optimized.html', { stdio: 'inherit' });

  // 提交更改
  execSync('git commit -m "Facebook Ads显示优化和错误处理\n\n- 添加DataTables初始化错误处理\n- 增强调试信息输出\n- 优化表格渲染逻辑\n- 提供多种部署方法\n- 包含详细的手动修改指导\n\n优化内容：\n1. 错误处理：DataTables初始化失败时显示错误信息\n2. 调试信息：详细的控制台输出帮助定位问题\n3. 表格渲染：确保表格元素正确创建和初始化\n4. 部署指导：提供多种应用优化的方法"', { stdio: 'inherit' });

  // 推送到远程
  execSync('git push', { stdio: 'inherit' });

  console.log('✅ Facebook Ads显示优化已部署完成！');
  console.log('');
  console.log('📋 下一步操作：');
  console.log('1. 按照 manual_optimization_steps.md 手动修改 public/independent-site.html');
  console.log('2. 或者运行 apply_facebook_ads_optimization.js 自动应用优化');
  console.log('3. 刷新页面测试Facebook Ads数据显示');
  console.log('4. 检查控制台调试信息');
  console.log('');
  console.log('🎯 预期结果：');
  console.log('- Facebook Ads数据正确显示');
  console.log('- 商品ID和商品名分离显示');
  console.log('- 详细的调试信息');
  console.log('- 更好的错误处理');

} catch (error) {
  console.error('❌ 部署过程中出现错误:', error.message);
  console.log('');
  console.log('🔧 手动执行步骤：');
  console.log('1. git add .');
  console.log('2. git commit -m "Facebook Ads显示优化"');
  console.log('3. git push');
}
