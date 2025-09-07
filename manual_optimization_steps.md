# 手动应用Facebook Ads显示优化

## 🎯 需要手动修改的文件
`public/independent-site.html`

## 📝 具体修改步骤

### 1. 替换DataTables初始化部分（第2129-2144行）

**找到这段代码：**
```javascript
    // 重新初始化DataTables
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
    console.log('DataTables重新初始化成功');
```

**替换为：**
```javascript
    // 重新初始化DataTables - 添加错误处理
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
      $table.html(`
        <thead>
          <tr>
            ${columns.map(col => `<th>${col.title}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="${columns.length}" style="text-align: center; color: red;">
              表格初始化失败: ${error.message}
            </td>
          </tr>
        </tbody>
      `);
    }
```

### 2. 在buildUnifiedTable函数开始处添加调试信息

**找到：**
```javascript
  function buildUnifiedTable(data, currentChannel) {
```

**替换为：**
```javascript
  function buildUnifiedTable(data, currentChannel) {
    console.log('开始构建统一表格 - 优化版本');
    console.log('输入数据:', {
      dataLength: data.length,
      currentChannel: currentChannel,
      sampleData: data.slice(0, 2)
    });
```

### 3. 添加列定义调试信息

**找到：**
```javascript
  const columns = getColumnsForChannel(currentChannel);
```

**替换为：**
```javascript
  const columns = getColumnsForChannel(currentChannel);
  console.log('列定义:', {
    columnsLength: columns.length,
    columnNames: columns.map(col => col.data)
  });
```

### 4. 优化Facebook Ads渠道调试信息

**找到：**
```javascript
    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
    } else {
```

**替换为：**
```javascript
    if (currentChannel === 'facebook_ads') {
      // Facebook Ads 列：所有列都显示（已在列定义中处理）
      console.log('Facebook Ads渠道，显示所有列');
    } else {
```

## 🚀 完成修改后的步骤

1. **保存文件**
2. **提交更改：**
   ```bash
   git add public/independent-site.html
   git commit -m "优化Facebook Ads显示和错误处理"
   ```
3. **推送到远程：**
   ```bash
   git push
   ```
4. **测试验证：**
   - 刷新页面（Ctrl+F5）
   - 检查控制台调试信息
   - 验证表格显示

## ✅ 预期效果

修改完成后，你将看到：
- 详细的调试信息输出
- 更好的错误处理
- Facebook Ads数据正确显示
- 商品ID和商品名分离显示
