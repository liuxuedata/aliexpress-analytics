#!/bin/bash

# Facebook Ads显示优化 - 提交和部署脚本

echo "🚀 开始Facebook Ads显示优化部署..."

# 添加所有优化文件
git add optimize_facebook_ads_display.js
git add facebook_ads_optimization_patch.js
git add manual_optimization_steps.md
git add apply_facebook_ads_optimization.js
git add quick_fix.js
git add deployment_instructions.md
git add optimize_and_deploy.md
git add public/independent-site-optimized.html

# 提交更改
git commit -m "Facebook Ads显示优化和错误处理

- 添加DataTables初始化错误处理
- 增强调试信息输出
- 优化表格渲染逻辑
- 提供多种部署方法
- 包含详细的手动修改指导

优化内容：
1. 错误处理：DataTables初始化失败时显示错误信息
2. 调试信息：详细的控制台输出帮助定位问题
3. 表格渲染：确保表格元素正确创建和初始化
4. 部署指导：提供多种应用优化的方法"

# 推送到远程
git push

echo "✅ Facebook Ads显示优化已部署完成！"
echo ""
echo "📋 下一步操作："
echo "1. 按照 manual_optimization_steps.md 手动修改 public/independent-site.html"
echo "2. 或者运行 apply_facebook_ads_optimization.js 自动应用优化"
echo "3. 刷新页面测试Facebook Ads数据显示"
echo "4. 检查控制台调试信息"
echo ""
echo "🎯 预期结果："
echo "- Facebook Ads数据正确显示"
echo "- 商品ID和商品名分离显示"
echo "- 详细的调试信息"
echo "- 更好的错误处理"
