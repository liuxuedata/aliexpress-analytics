// 直接应用优化到原文件
const fs = require('fs');

// 读取原文件
let content = fs.readFileSync('public/independent-site.html', 'utf8');

// 1. 替换DataTables初始化部分
const oldInit = `    // 重新初始化DataTables
    dt = $('#report').DataTable({
      destroy: true,
      pageLength: 20,
      data: validatedData,
      scrollX: false,
      fixedHeader: true,
      autoWidth: true,
      processing: true,
      responsive: false,
      columns: columns,
      language: {
        emptyTable: "暂无数据",
        zeroRecords: "没有找到匹配的记录"
      }
    });
    console.log('DataTables重新初始化成功');`;

const newInit = `    // 重新初始化DataTables - 添加错误处理
    try {
      dt = $('#report').DataTable({
        destroy: true,
        pageLength: 20,
        data: validatedData,
        scrollX: false,
        fixedHeader: true,
        autoWidth: true,
        processing: true,
        responsive: false,
        columns: columns,
        language: {
          emptyTable: "暂无数据",
          zeroRecords: "没有找到匹配的记录"
        },
        error: function(xhr, error, thrown) {
          console.error('DataTables初始化错误:', {
            xhr: xhr,
            error: error,
            thrown: thrown
          });
        }
      });
      console.log('DataTables重新初始化成功');
    } catch (error) {
      console.error('DataTables初始化失败:', error);
      // 显示错误信息给用户
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
    }`;

// 2. 添加调试信息到buildUnifiedTable函数
const oldBuildStart = `  function buildUnifiedTable(data, currentChannel) {`;
const newBuildStart = `  function buildUnifiedTable(data, currentChannel) {
    console.log('开始构建统一表格 - 优化版本');
    console.log('输入数据:', {
      dataLength: data.length,
      currentChannel: currentChannel,
      sampleData: data.slice(0, 2)
    });`;

// 3. 添加列定义调试信息
const oldColumns = `  const columns = getColumnsForChannel(currentChannel);`;
const newColumns = `  const columns = getColumnsForChannel(currentChannel);
  console.log('列定义:', {
    columnsLength: columns.length,
    columnNames: columns.map(col => col.data)
  });`;

// 4. 优化Facebook Ads调试信息
const oldFacebook = `    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
    } else {`;
const newFacebook = `    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
      console.log('Facebook Ads渠道，显示所有列');
    } else {`;

// 应用所有修改
content = content.replace(oldInit, newInit);
content = content.replace(oldBuildStart, newBuildStart);
content = content.replace(oldColumns, newColumns);
content = content.replace(oldFacebook, newFacebook);

// 写回文件
fs.writeFileSync('public/independent-site.html', content, 'utf8');

console.log('✅ 优化已直接应用到 public/independent-site.html');
console.log('📝 修改内容：');
console.log('   1. 添加了DataTables初始化的错误处理');
console.log('   2. 添加了详细的调试信息');
console.log('   3. 优化了Facebook Ads渠道的调试输出');
console.log('🚀 现在可以提交并推送更改了！');
