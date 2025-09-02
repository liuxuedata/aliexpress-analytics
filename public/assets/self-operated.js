/**
 * 自运营页面专用逻辑
 * 继承自页面模板系统，处理自运营页面的特定功能
 */

(function() {
  'use strict';

  // 等待页面模板系统加载完成
  function waitForPageManager() {
    if (window.PageManager) {
      initSelfOperatedPage();
    } else {
      setTimeout(waitForPageManager, 100);
    }
  }

  // 初始化自运营页面
  function initSelfOperatedPage() {
    console.log('初始化自运营页面专用功能...');
    
    // 创建自运营页面管理器
    const selfOperatedManager = new SelfOperatedPageManager();
    
    // 等待页面就绪
    document.addEventListener('page-ready', (e) => {
      console.log('自运营页面就绪:', e.detail);
      selfOperatedManager.onPageReady(e.detail);
    });
  }

  // 自运营页面管理器类
  class SelfOperatedPageManager extends window.PageManager {
    constructor() {
      super();
      this.dataTable = null;
      this.currentData = null;
    }

    // 重写数据加载方法
    async loadData() {
      // 防止重复加载
      if (this.isLoading) {
        console.log('数据正在加载中，跳过重复请求');
        return;
      }
      
      try {
        this.isLoading = true;
        console.log('自运营页面开始加载数据...');
        console.log('当前站点信息:', { site: this.currentSite, siteName: this.currentSiteName });
        
        // 获取日期范围
        const dateRange = this.getDateRange();
        if (!dateRange) {
          throw new Error('无法获取日期范围');
        }

        console.log('获取到日期范围:', dateRange);

        // 显示加载状态
        this.showLoadingState('detail');
        
        // 加载聚合数据
        const rowsNowAgg = await this.fetchAggregatedData(dateRange.start, dateRange.end, 'day');
        
        console.log('聚合数据加载完成，记录数:', rowsNowAgg.length);
        
        // 验证数据格式
        if (rowsNowAgg.length > 0) {
          console.log('数据样本:', rowsNowAgg[0]);
          console.log('数据字段:', Object.keys(rowsNowAgg[0]));
        }
        
                 // 计算KPI卡片
         this.computeKPICards(rowsNowAgg);
         
         // 渲染数据表格
         await this.renderDataTable(rowsNowAgg, 'day');
         
         // 重新应用KPI值，防止被表格渲染覆盖
         this.reapplyKPICards(rowsNowAgg);
         
         // 加载对比数据
         await this.loadComparisonData(dateRange);
         
         // 隐藏加载状态
         this.hideLoadingState('detail');
         
         // 更新进度显示
         this.updateProgress(rowsNowAgg.length);
        
        console.log('自运营页面数据加载完成');
        
      } catch (error) {
        console.error('自运营页面数据加载失败:', error);
        this.hideLoadingState('detail');
        
        // 显示详细的错误信息
        const errorMessage = `数据加载失败: ${error.message || error}`;
        console.error(errorMessage);
        
        // 使用alert显示错误，确保用户能看到
        if (typeof alert === 'function') {
          alert(errorMessage);
        }
      } finally {
        this.isLoading = false;
      }
    }

    // 获取日期范围
    getDateRange() {
      // 尝试多种方式查找日期选择器
      let dateFilter = document.getElementById('dateFilter');
      
      if (!dateFilter) {
        // 如果通过ID找不到，尝试通过类名查找
        dateFilter = document.querySelector('.date-filter');
      }
      
      if (!dateFilter) {
        // 如果还是找不到，尝试通过placeholder查找
        dateFilter = document.querySelector('input[placeholder*="日期"], input[placeholder*="date"]');
      }
      
      if (!dateFilter) {
        console.error('未找到日期选择器元素，尝试了多种查找方式');
        // 返回默认日期范围作为备用
        const today = new Date();
        const end = today.toISOString().slice(0, 10);
        const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        console.log('使用默认日期范围:', { start, end });
        return { start, end };
      }
      
      if (!dateFilter.value) {
        console.error('日期选择器没有值');
        // 返回默认日期范围作为备用
        const today = new Date();
        const end = today.toISOString().slice(0, 10);
        const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        console.log('使用默认日期范围:', { start, end });
        return { start, end };
      }

      const value = dateFilter.value;
      console.log('日期选择器值:', value);
      
      if (value.includes(' to ')) {
        const [start, end] = value.split(' to ');
        const result = { start: start.trim(), end: end.trim() };
        console.log('解析的日期范围:', result);
        return result;
      }

      console.error('日期格式不正确:', value);
      // 返回默认日期范围作为备用
      const today = new Date();
      const end = today.toISOString().slice(0, 10);
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      console.log('使用默认日期范围:', { start, end });
      return { start, end };
    }

    // 显示加载状态
    showLoadingState(section) {
      const loadingEl = document.getElementById(section + 'Loading');
      const contentEl = document.getElementById(section + 'Content');
      
      if (loadingEl) loadingEl.style.display = '';
      if (contentEl) contentEl.style.display = 'none';
    }

    // 隐藏加载状态
    hideLoadingState(section) {
      const loadingEl = document.getElementById(section + 'Loading');
      const contentEl = document.getElementById(section + 'Content');
      
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = '';
    }

    // 获取聚合数据
    async fetchAggregatedData(startISO, endISO, granularity) {
      const params = new URLSearchParams({
        start: startISO,
        end: endISO,
        granularity: granularity,
        site: this.currentSite || 'ae_self_operated_a',
        aggregate: 'product'
      });

      const url = `/api/ae_query?${params.toString()}`;
      console.log('请求URL:', url);
      console.log('请求参数:', Object.fromEntries(params));

      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API响应:', data);
        
        if (!data.ok) {
          throw new Error(data.msg || 'API请求失败');
        }
        
        const rows = data.rows || [];
        console.log(`成功获取数据，记录数: ${rows.length}`);
        
        // 如果数据为空，尝试不同的聚合方式
        if (rows.length === 0) {
          console.log('尝试使用不同的聚合参数...');
          const alternativeParams = new URLSearchParams({
            start: startISO,
            end: endISO,
            granularity: granularity,
            site: this.currentSite || 'ae_self_operated_a',
            aggregate: 'true' // 尝试使用 'true' 而不是 'product'
          });
          
          const alternativeUrl = `/api/ae_query?${alternativeParams.toString()}`;
          console.log('尝试替代URL:', alternativeUrl);
          
          const altResponse = await fetch(alternativeUrl);
          if (altResponse.ok) {
            const altData = await altResponse.json();
            if (altData.ok && altData.rows && altData.rows.length > 0) {
              console.log('使用替代参数成功获取数据:', altData.rows.length);
              return altData.rows;
            }
          }
          
          // 如果还是为空，尝试不使用聚合
          console.log('尝试不使用聚合参数...');
          const noAggregateParams = new URLSearchParams({
            start: startISO,
            end: endISO,
            granularity: granularity,
            site: this.currentSite || 'ae_self_operated_a'
          });
          
          const noAggregateUrl = `/api/ae_query?${noAggregateParams.toString()}`;
          console.log('尝试无聚合URL:', noAggregateUrl);
          
          const noAggResponse = await fetch(noAggregateUrl);
          if (noAggResponse.ok) {
            const noAggData = await noAggResponse.json();
            if (noAggData.ok && noAggData.rows && noAggData.rows.length > 0) {
              console.log('使用无聚合参数成功获取数据:', noAggData.rows.length);
              return noAggData.rows;
            }
          }
        }
        
        return rows;
      } catch (error) {
        console.error('API请求失败:', error);
        throw error;
      }
    }

    // 计算KPI卡片
    computeKPICards(data) {
      if (!data || !Array.isArray(data)) return;
      
      console.log('开始计算KPI卡片，原始数据:', data.slice(0, 3)); // 只显示前3条用于调试
      
      // 计算平均值
      const total = data.length;
      let totalVisitorRatio = 0;
      let totalCartRatio = 0;
      let totalPayRatio = 0;
      let totalProducts = 0;
      let cartedProducts = 0;
      let purchasedProducts = 0;

      data.forEach((row, index) => {
        // 确保数据是数字类型
        const visitorRatio = parseFloat(row.visitor_ratio) || 0;
        const cartRatio = parseFloat(row.cart_ratio) || 0;
        const payRatio = parseFloat(row.pay_ratio) || 0;
        
        // 直接使用原始值，不进行额外的百分比转换
        totalVisitorRatio += visitorRatio;
        totalCartRatio += cartRatio;
        totalPayRatio += payRatio;
        totalProducts++;
        
        if (cartRatio > 0) cartedProducts++;
        if (payRatio > 0) purchasedProducts++;
        
        // 调试信息
        if (index < 3) {
          console.log(`行${index + 1}:`, {
            visitorRatio,
            cartRatio,
            payRatio
          });
        }
      });

      // 计算平均值
      const avgVisitorRatio = total > 0 ? (totalVisitorRatio / total) : 0;
      const avgCartRatio = total > 0 ? (totalCartRatio / total) : 0;
      const avgPayRatio = total > 0 ? (totalPayRatio / total) : 0;

      console.log('KPI计算结果:', {
        total,
        avgVisitorRatio: avgVisitorRatio.toFixed(2) + '%',
        avgCartRatio: avgCartRatio.toFixed(2) + '%',
        avgPayRatio: avgPayRatio.toFixed(2) + '%',
        totalProducts,
        cartedProducts,
        purchasedProducts
      });

      // 更新KPI卡片
      this.updateKPICard('avgVisitor', avgVisitorRatio.toFixed(2) + '%');
      this.updateKPICard('avgCart', avgCartRatio.toFixed(2) + '%');
      this.updateKPICard('avgPay', avgPayRatio.toFixed(2) + '%');
      this.updateKPICard('totalProducts', totalProducts);
      this.updateKPICard('cartedProducts', cartedProducts);
      this.updateKPICard('purchasedProducts', purchasedProducts);
    }

         // 更新KPI卡片
     updateKPICard(id, value) {
       const element = document.getElementById(id);
       if (element) {
         element.textContent = value;
       }
     }

     // 重新应用KPI值，防止被表格渲染覆盖
     reapplyKPICards(data) {
       if (!data || !Array.isArray(data)) return;
       
       console.log('重新应用KPI值...');
       
       // 重新计算并应用KPI值
       const total = data.length;
       let totalVisitorRatio = 0;
       let totalCartRatio = 0;
       let totalPayRatio = 0;
       let totalProducts = 0;
       let cartedProducts = 0;
       let purchasedProducts = 0;

       data.forEach(row => {
         const visitorRatio = parseFloat(row.visitor_ratio) || 0;
         const cartRatio = parseFloat(row.cart_ratio) || 0;
         const payRatio = parseFloat(row.pay_ratio) || 0;
         
         totalVisitorRatio += visitorRatio;
         totalCartRatio += cartRatio;
         totalPayRatio += payRatio;
         totalProducts++;
         
         if (cartRatio > 0) cartedProducts++;
         if (payRatio > 0) purchasedProducts++;
       });

       // 计算平均值
       const avgVisitorRatio = total > 0 ? (totalVisitorRatio / total) : 0;
       const avgCartRatio = total > 0 ? (totalCartRatio / total) : 0;
       const avgPayRatio = total > 0 ? (totalPayRatio / total) : 0;

       // 重新应用KPI值
       this.updateKPICard('avgVisitor', avgVisitorRatio.toFixed(2) + '%');
       this.updateKPICard('avgCart', avgCartRatio.toFixed(2) + '%');
       this.updateKPICard('avgPay', avgPayRatio.toFixed(2) + '%');
       this.updateKPICard('totalProducts', totalProducts);
       this.updateKPICard('cartedProducts', cartedProducts);
       this.updateKPICard('purchasedProducts', purchasedProducts);
       
       console.log('KPI值重新应用完成');
     }

    // 渲染数据表格
    async renderDataTable(data, granularity) {
      if (!data || !Array.isArray(data)) return;
      
      const table = document.getElementById('report');
      if (!table) return;

      console.log('开始渲染数据表格，数据量:', data.length);

      // 如果DataTable已经初始化，销毁它
      if (this.dataTable) {
        try {
          this.dataTable.destroy();
          this.dataTable = null;
          console.log('DataTable已销毁');
        } catch (error) {
          console.warn('销毁DataTable时出错:', error);
        }
      }

      // 清空表格内容，但保留表格元素本身
      const existingTbody = table.querySelector('tbody');
      if (existingTbody) {
        existingTbody.remove();
      }
      
      const existingThead = table.querySelector('thead');
      if (existingThead) {
        existingThead.remove();
      }
      
      // 检查并移除所有DataTables相关的包装器和元素
      const existingWrappers = table.parentNode.querySelectorAll('.dataTables_wrapper, .dataTables_filter, .dataTables_length, .dataTables_info, .dataTables_paginate, .dataTables_processing');
      existingWrappers.forEach(wrapper => {
        wrapper.remove();
      });
      
      // 移除表格上的DataTable相关类
      table.classList.remove('dataTable', 'display', 'compact');
      
      // 移除表格上的DataTable相关属性
      table.removeAttribute('width');
      table.removeAttribute('cellspacing');
      table.removeAttribute('cellpadding');
      
      // 确保表格有正确的ID
      if (!table.id) {
        table.id = 'report';
      }

      // 创建表头 - 确保与HTML中的列数完全匹配
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>商品(ID)</th>
          <th>周期</th>
          <th>访客比(%)</th>
          <th>加购比(%)</th>
          <th>支付比(%)</th>
          <th>曝光量</th>
          <th>访客数</th>
          <th>浏览量</th>
          <th>加购人数</th>
          <th>下单商品件数</th>
          <th>支付件数</th>
          <th>支付买家数</th>
          <th>搜索点击率(%)</th>
          <th>平均停留时长(秒)</th>
        </tr>
      `;
      table.appendChild(thead);

      // 创建表体
      const tbody = document.createElement('tbody');
      if (data.length === 0) {
        // 如果没有数据，显示提示行
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="14" style="text-align: center; padding: 20px; color: #666;">暂无数据</td>';
        tbody.appendChild(tr);
      } else {
        data.forEach((row, index) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.product_id || ''}</td>
            <td>${this.formatDateRange(row.start_date, row.end_date)}</td>
            <td>${this.formatPercentage(row.visitor_ratio)}</td>
            <td>${this.formatPercentage(row.cart_ratio)}</td>
            <td>${this.formatPercentage(row.pay_ratio)}</td>
            <td>${this.formatNumber(row.exposure || 0)}</td>
            <td>${this.formatNumber(row.visitors || 0)}</td>
            <td>${this.formatNumber(row.page_views || 0)}</td>
            <td>${this.formatNumber(row.cart_users || 0)}</td>
            <td>${this.formatNumber(row.order_items || 0)}</td>
            <td>${this.formatNumber(row.pay_items || 0)}</td>
            <td>${this.formatNumber(row.pay_buyers || 0)}</td>
            <td>${this.formatPercentage(row.search_ctr)}</td>
            <td>${this.formatNumber(row.avg_stay_seconds || 0)}</td>
          `;
          tbody.appendChild(tr);
        });
      }
      table.appendChild(tbody);

      // 等待DOM更新完成后再初始化DataTable
      await new Promise(resolve => setTimeout(resolve, 200));

      // 初始化DataTable
      if (window.jQuery && jQuery.fn.DataTable) {
        try {
          // 再次检查是否已经有DataTable实例
          if (jQuery(table).hasClass('dataTable')) {
            console.log('表格已经是DataTable实例，跳过初始化');
            return;
          }

                     this.dataTable = jQuery(table).DataTable({
             pageLength: 10,
             order: [[1, 'desc']],
             scrollX: true,
             scrollY: 'calc(100vh - 420px)',
             scrollCollapse: true,
             fixedHeader: true,
             language: {
               url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/zh.json'
             },
             destroy: true,
             responsive: true,
             // 明确指定列定义，确保与HTML完全匹配
             columns: [
               { title: '商品(ID)', data: 0 },
               { title: '周期', data: 1 },
               { title: '访客比(%)', data: 2 },
               { title: '加购比(%)', data: 3 },
               { title: '支付比(%)', data: 4 },
               { title: '曝光量', data: 5 },
               { title: '访客数', data: 6 },
               { title: '浏览量', data: 7 },
               { title: '加购人数', data: 8 },
               { title: '下单商品件数', data: 9 },
               { title: '支付件数', data: 10 },
               { title: '支付买家数', data: 11 },
               { title: '搜索点击率(%)', data: 12 },
               { title: '平均停留时长(秒)', data: 13 }
             ]
           });
          console.log('DataTable初始化成功，数据行数:', this.dataTable.data().count());
        } catch (error) {
          console.error('DataTable初始化失败:', error);
        }
      } else {
        console.warn('jQuery或DataTables未加载');
      }
    }

    // 加载对比数据
    async loadComparisonData(dateRange) {
      try {
        // 计算上一周期
        const prevStart = new Date(dateRange.start);
        prevStart.setDate(prevStart.getDate() - 30);
        const prevEnd = new Date(dateRange.start);
        prevEnd.setDate(prevEnd.getDate() - 1);

        // 加载当前周期和上一周期数据
        const currentData = await this.fetchAggregatedData(dateRange.start, dateRange.end, 'day');
        const prevData = await this.fetchAggregatedData(
          prevStart.toISOString().slice(0, 10),
          prevEnd.toISOString().slice(0, 10),
          'day'
        );

        // 这里可以添加图表绘制逻辑
        console.log('对比数据加载完成:', {
          current: currentData.length,
          previous: prevData.length
        });

      } catch (error) {
        console.warn('对比数据加载失败:', error);
      }
    }

    // 更新进度显示
    updateProgress(count) {
      const progressEl = document.getElementById('progress');
      if (progressEl) {
        progressEl.textContent = `数据加载完成: ${count} 条记录`;
      }
    }

    // 格式化日期范围
    formatDateRange(start, end) {
      if (!start || !end) return '';
      return `${start}~${end}`;
    }

    // 格式化数字
    formatNumber(num) {
      if (num === null || num === undefined) return '0';
      const n = Number(num);
      if (isNaN(n)) return '0';
      return n.toLocaleString();
    }

    // 格式化百分比
    formatPercentage(num) {
      if (num === null || num === undefined) return '0%';
      let n = Number(num);
      if (isNaN(n)) return '0%';
      if (n <= 1) n *= 100;
      return n.toFixed(2) + '%';
    }

    // 页面就绪回调
    onPageReady(pageInfo) {
      console.log('自运营页面就绪，开始加载数据:', pageInfo);
      
      // 设置当前站点信息
      this.currentSite = pageInfo.site;
      this.currentSiteName = pageInfo.siteName;
      
      // 开始加载数据
      this.loadData();
    }

    // 处理文件上传
    handleFileUpload(file) {
      // 文件上传逻辑
      console.log('处理文件上传:', file.name);
      
      // 这里可以添加文件上传到服务器的逻辑
      this.showProgress('文件上传中...');
      
      // 模拟上传过程
      setTimeout(() => {
        this.hideProgress();
        this.showSuccess('文件上传成功');
        this.refreshData();
      }, 2000);
    }

    // 显示进度
    showProgress(message) {
      const progressEl = document.getElementById('progress');
      if (progressEl) {
        progressEl.textContent = message;
      }
    }

    // 隐藏进度
    hideProgress() {
      const progressEl = document.getElementById('progress');
      if (progressEl) {
        progressEl.textContent = '';
      }
    }

    // 显示成功消息
    showSuccess(message) {
      // 这里可以使用更好的提示组件
      console.log('成功:', message);
    }
  }

  // 等待页面模板系统加载
  waitForPageManager();

})();
