// Facebook Ads显示优化补丁
// 这个文件包含了需要应用到 public/independent-site.html 的优化代码

// 1. 优化的Facebook Ads列定义 - 替换第1632-1662行
function getFacebookAdsColumns() {
  return [
    // 核心字段 - 确保这些字段在数据中存在
    { data: 'product_id', title: '商品ID', render: (v, t, r) => {
      const productId = r.product_id || '';
      return `<span class="product-id" title="${productId}">${productId}</span>`;
    }, width: '120px' },
    { data: 'product_name', title: '商品名称', render: (v, t, r) => {
      const productName = r.product_name || '';
      return `<span class="product-name" title="${productName}">${shorten(productName, 50)}</span>`;
    }, width: '200px' },
    { data: 'days', title: '天数', render: v => v ?? 0, width: '80px' },
    { data: 'campaign_name', title: '广告系列名称', render: v => v || '', width: '150px' },
    { data: 'adset_name', title: '广告组名称', render: v => v || '', width: '150px' },
    { data: 'reach', title: '覆盖人数', render: v => v ?? 0, width: '100px' },
    { data: 'impr', title: '展示次数', render: v => v ?? 0, width: '100px' },
    { data: 'page_views', title: '浏览量', render: v => v ?? 0, width: '100px' },
    { data: 'cost_per_result', title: '单次成效费用', render: v => (v ?? 0).toFixed(2), width: '120px' },
    { data: 'link_clicks', title: '链接点击量', render: v => v ?? 0, width: '100px' },
    { data: 'link_ctr', title: '链接点击率', render: v => v != null ? (v*100).toFixed(2)+'%' : '0%', width: '100px' },
    { data: 'clicks', title: '点击量（全部）', render: v => v ?? 0, width: '100px' },
    { data: 'ctr', title: '点击率（全部）', render: v => v != null ? (v*100).toFixed(2)+'%' : '0%', width: '100px' },
    { data: 'atc_total', title: '加入购物车', render: v => v ?? 0, width: '100px' },
    { data: 'wishlist_adds', title: '加入心愿单次数', render: v => v ?? 0, width: '120px' },
    { data: 'ic_total', title: '结账发起次数', render: v => v ?? 0, width: '120px' },
    { data: 'results', title: '成效', render: v => v ?? 0, width: '100px' },
    { data: 'row_start_date', title: '开始日期', render: v => v || '', width: '100px' },
    { data: 'cost', title: '花费', render: v => (v ?? 0).toFixed(2), width: '100px' }
  ];
}

// 2. 优化的DataTables初始化 - 替换第2129-2144行
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

// 3. 添加调试信息 - 在buildUnifiedTable函数开始处添加
  console.log('开始构建统一表格 - 优化版本');
  console.log('输入数据:', {
    dataLength: data.length,
    currentChannel: currentChannel,
    sampleData: data.slice(0, 2)
  });

// 4. 添加列定义调试信息 - 在获取列定义后添加
  console.log('列定义:', {
    columnsLength: columns.length,
    columnNames: columns.map(col => col.data)
  });

// 5. 添加Facebook Ads渠道调试信息 - 替换第2147-2149行
  if (currentChannel === 'facebook_ads') {
    // Facebook Ads 列：所有列都显示（已在列定义中处理）
    console.log('Facebook Ads渠道，显示所有列');
  } else {
