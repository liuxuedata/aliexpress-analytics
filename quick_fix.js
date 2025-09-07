// 快速修复Facebook Ads显示问题的脚本
const fs = require('fs');

// 读取文件
let content = fs.readFileSync('public/independent-site.html', 'utf8');

// 应用关键修复
content = content.replace(
  '    console.log(\'DataTables重新初始化成功\');',
  `    console.log('DataTables重新初始化成功');
    } catch (error) {
      console.error('DataTables初始化失败:', error);
      $table.html(\`
        <thead>
          <tr>
            \${columns.map(col => \`<th>\${col.title}</th>\`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="\${columns.length}" style="text-align: center; color: red;">
              表格初始化失败: \${error.message}
            </td>
          </tr>
        </tbody>
      \`);
    }`
);

content = content.replace(
  '    // 重新初始化DataTables',
  '    // 重新初始化DataTables - 添加错误处理\n    try {'
);

// 写回文件
fs.writeFileSync('public/independent-site.html', content, 'utf8');

console.log('✅ 快速修复已应用！');
