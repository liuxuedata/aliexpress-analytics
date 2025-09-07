// 应用Facebook Ads显示优化的脚本
// 这个脚本将直接修改 public/independent-site.html 文件

const fs = require('fs');
const path = require('path');

// 读取原文件
const filePath = path.join(__dirname, 'public', 'independent-site.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 优化DataTables初始化部分，添加错误处理
const oldDataTablesInit = `    // 重新初始化DataTables
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

const newDataTablesInit = `    // 重新初始化DataTables - 添加错误处理
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

// 2. 添加调试信息
const oldBuildTableStart = `  function buildUnifiedTable(data, currentChannel) {`;
const newBuildTableStart = `  function buildUnifiedTable(data, currentChannel) {
    console.log('开始构建统一表格 - 优化版本');
    console.log('输入数据:', {
      dataLength: data.length,
      currentChannel: currentChannel,
      sampleData: data.slice(0, 2)
    });`;

// 3. 添加列定义调试信息
const oldColumnsDebug = `  const columns = getColumnsForChannel(currentChannel);`;
const newColumnsDebug = `  const columns = getColumnsForChannel(currentChannel);
  console.log('列定义:', {
    columnsLength: columns.length,
    columnNames: columns.map(col => col.data)
  });`;

// 4. 优化Facebook Ads渠道调试信息
const oldFacebookAdsDebug = `    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
    } else {`;
const newFacebookAdsDebug = `    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
      console.log('Facebook Ads渠道，显示所有列');
    } else {`;

// 应用所有修改
content = content.replace(oldDataTablesInit, newDataTablesInit);
content = content.replace(oldBuildTableStart, newBuildTableStart);
content = content.replace(oldColumnsDebug, newColumnsDebug);
content = content.replace(oldFacebookAdsDebug, newFacebookAdsDebug);

// 写回文件
fs.writeFileSync(filePath, content, 'utf8');

console.log('Facebook Ads显示优化已应用完成！');
console.log('修改内容：');
console.log('1. 添加了DataTables初始化的错误处理');
console.log('2. 添加了详细的调试信息');
console.log('3. 优化了Facebook Ads渠道的调试输出');
