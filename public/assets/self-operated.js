/**
 * 自运营页面专用逻辑
 * 继承自页面模板系统，处理自运营页面的特定功能
 */

(function() {
  'use strict';

  // 等待页面模板系统加载完成
  let selfOperatedManager = null;
  let pageReadyListener = null;
  
  function waitForPageManager() {
    if (window.PageManager) {
      initSelfOperatedPage();
    } else {
      setTimeout(waitForPageManager, 100);
    }
  }

  // 初始化自运营页面
  function initSelfOperatedPage() {
    // 防止重复初始化
    if (selfOperatedManager) {
      console.log('自运营页面管理器已存在，跳过重复初始化');
      return;
    }
    
    console.log('初始化自运营页面专用功能...');
    
    // 创建自运营页面管理器
    selfOperatedManager = new SelfOperatedPageManager();
    
    // 移除旧的事件监听器（如果存在）
    if (pageReadyListener) {
      document.removeEventListener('page-ready', pageReadyListener);
    }
    
    // 创建新的事件监听器
    pageReadyListener = (e) => {
      console.log('自运营页面就绪:', e.detail);
      if (selfOperatedManager && !selfOperatedManager.pageReadyTriggered) {
        selfOperatedManager.onPageReady(e.detail);
      }
    };
    
    // 等待页面就绪
    document.addEventListener('page-ready', pageReadyListener);
  }

  // 自运营页面管理器类
  class SelfOperatedPageManager extends window.PageManager {
    constructor() {
      super();
      this.dataTable = null;
      this.currentData = null;
      this.pageReadyTriggered = false;
      this.isLoading = false;
    }

      // 数据加载主方法（与index.html保持一致）
  async loadData() {
    try {
      console.log('开始加载所有数据...');
      
      // 获取日期范围
      const { from, to } = this.getDateRange();
      const startISO = from;
      const endISO = to;
      
      // 计算对比周期
      const { prevStart, prevEnd, days } = this.periodShift(startISO, endISO);
      
      console.log('当前周期:', startISO, 'to', endISO);
      console.log('对比周期:', prevStart, 'to', prevEnd);
      
      // 使用Promise.all并行获取数据，避免多次调用
      const [rowsAggA, rowsAggB] = await Promise.all([
        this.fetchAggregatedData(startISO, endISO, 'day'),
        this.fetchAggregatedData(prevStart, prevEnd, 'day')
      ]);
      
      console.log('成功获取数据:', {
        '当前周期': rowsAggA.length,
        '对比周期': rowsAggB.length
      });
      
      // 一次性计算所有KPI
      this.computeCards(rowsAggA, rowsAggB);
      
      // 渲染数据表格
      await this.renderTable(rowsAggA, 'day');
      
      // 更新状态
      this.updateStatus('加载完成');
      
    } catch (error) {
      console.error('数据加载失败:', error);
      this.updateStatus('加载失败：' + (error.message || error));
      this.showError('查询失败：' + (error.message || error));
    }
  }

      // 获取日期范围（与index.html保持一致）
  getDateRange() {
    const input = document.getElementById('dateFilter');
    if (input && input.value && input.value.includes(' to ')) {
      const [from, to] = input.value.split(' to ');
      return { from: from.trim(), to: to.trim() };
    }
    
    // 返回默认日期范围
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    // 如果今天是2024年或更早，使用2025-07-01作为开始日期
    const from = today.getFullYear() < 2025 ? '2025-07-01' : new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    
    // 更新日期选择器的值
    if (input) {
      input.value = `${from} to ${to}`;
    }
    
    return { from, to };
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

             // 计算KPI卡片（包含对比数据）
    computeKPICardsWithComparison(currentData, comparisonData) {
      if (!currentData || !Array.isArray(currentData)) return;
      
      console.log('开始计算KPI卡片（含对比数据）:', {
        current: currentData.length,
        comparison: comparisonData ? comparisonData.length : 0
      });
      
      // 计算当前周期KPI
      const currentKPIs = this.calculateKPIs(currentData);
      
      // 计算对比周期KPI
      const comparisonKPIs = comparisonData && comparisonData.length > 0 ? 
        this.calculateKPIs(comparisonData) : null;
      
      // 计算对比变化
      const comparisonChanges = comparisonKPIs ? 
        this.calculateComparisonChanges(currentKPIs, comparisonKPIs) : null;
      
      console.log('KPI计算结果:', {
        current: currentKPIs,
        comparison: comparisonKPIs,
        changes: comparisonChanges
      });
      
      // 更新KPI卡片（包含对比数据）
      this.updateKPICardsWithComparison(currentKPIs, comparisonChanges);
      
      // 验证KPI更新是否成功
      setTimeout(() => {
        this.verifyKPICards();
      }, 100);
    }

    // 计算KPI卡片（原始方法，保留兼容性）
    computeKPICards(data) {
      return this.computeKPICardsWithComparison(data, null);
    }

    // 计算单个数据集的KPI
    calculateKPIs(data) {
      if (!data || !Array.isArray(data)) return null;
      
      const total = data.length;
      let totalVisitorRatio = 0;
      let totalCartRatio = 0;
      let totalPayRatio = 0;
      let totalProducts = 0;
      let cartedProducts = 0;
      let purchasedProducts = 0;

             data.forEach((row, index) => {
         // 调试：输出前3行的详细数据
         if (index < 3) {
           console.log(`行${index + 1} KPI计算原始数据:`, {
             visitor_ratio: row.visitor_ratio,
             cart_ratio: row.cart_ratio,
             pay_ratio: row.pay_ratio,
             exposure: row.exposure,
             visitors: row.visitors,
             cart_users: row.cart_users,
             pay_buyers: row.pay_buyers
           });
         }
         
         // 尝试多种字段名，确保能获取到数据
         const visitorRatio = parseFloat(row.visitor_ratio || row.visitor_ratio_sum || row.visitor_ratio_avg || 0);
         const cartRatio = parseFloat(row.cart_ratio || row.cart_ratio_sum || row.cart_ratio_avg || 0);
         const payRatio = parseFloat(row.pay_ratio || row.pay_ratio_sum || row.pay_ratio_avg || 0);
         
         // 如果比率字段不存在，尝试从原始数据计算
         let finalVisitorRatio = visitorRatio;
         let finalCartRatio = cartRatio;
         let finalPayRatio = payRatio;
         
         // 计算访客比：访客数/曝光量
         if (!visitorRatio && row.exposure && row.visitors && row.exposure > 0) {
           finalVisitorRatio = (row.visitors / row.exposure) * 100;
           if (index < 3) console.log(`行${index + 1} 计算访客比: ${row.visitors}/${row.exposure} = ${finalVisitorRatio.toFixed(2)}%`);
         }
         
         // 计算加购比：加购人数/访客数
         if (!cartRatio && row.visitors && row.cart_users && row.visitors > 0) {
           finalCartRatio = (row.cart_users / row.visitors) * 100;
           if (index < 3) console.log(`行${index + 1} 计算加购比: ${row.cart_users}/${row.visitors} = ${finalCartRatio.toFixed(2)}%`);
         }
         
         // 计算支付比：支付买家数/加购人数
         if (!payRatio && row.cart_users && row.pay_buyers && row.cart_users > 0) {
           finalPayRatio = (row.pay_buyers / row.cart_users) * 100;
           if (index < 3) console.log(`行${index + 1} 计算支付比: ${row.pay_buyers}/${row.cart_users} = ${finalPayRatio.toFixed(2)}%`);
         }
         
         // 累加计算
         totalVisitorRatio += finalVisitorRatio;
         totalCartRatio += finalCartRatio;
         totalPayRatio += finalPayRatio;
         totalProducts++;
         
         // 统计有加购和支付的商品数
         if (row.cart_users && row.cart_users > 0) cartedProducts++;
         if (row.pay_buyers && row.pay_buyers > 0) purchasedProducts++;
         
         if (index < 3) {
           console.log(`行${index + 1} KPI计算:`, {
             original: { visitorRatio, cartRatio, payRatio },
             calculated: { finalVisitorRatio, finalCartRatio, finalPayRatio },
             carted: row.cart_users > 0,
             purchased: row.pay_buyers > 0
           });
         }
       });

      // 计算平均值
      const avgVisitorRatio = total > 0 ? (totalVisitorRatio / total) : 0;
      const avgCartRatio = total > 0 ? (totalCartRatio / total) : 0;
      const avgPayRatio = total > 0 ? (totalPayRatio / total) : 0;

      return {
        total,
        avgVisitorRatio,
        avgCartRatio,
        avgPayRatio,
        totalProducts,
        cartedProducts,
        purchasedProducts
      };
    }

    // 计算对比变化
    calculateComparisonChanges(current, previous) {
      if (!current || !previous) return null;
      
      const changes = {};
      
      // 计算百分比变化
      changes.avgVisitorRatio = this.calculatePercentageChange(
        current.avgVisitorRatio, previous.avgVisitorRatio
      );
      changes.avgCartRatio = this.calculatePercentageChange(
        current.avgCartRatio, previous.avgCartRatio
      );
      changes.avgPayRatio = this.calculatePercentageChange(
        current.avgPayRatio, previous.avgPayRatio
      );
      changes.totalProducts = this.calculateNumberChange(
        current.totalProducts, previous.totalProducts
      );
      changes.cartedProducts = this.calculateNumberChange(
        current.cartedProducts, previous.cartedProducts
      );
      changes.purchasedProducts = this.calculateNumberChange(
        current.purchasedProducts, previous.purchasedProducts
      );
      
      return changes;
    }

    // 计算百分比变化
    calculatePercentageChange(current, previous) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    }

    // 计算数字变化
    calculateNumberChange(current, previous) {
      return current - previous;
    }

             // 更新KPI卡片（包含对比数据）
    updateKPICardsWithComparison(currentKPIs, comparisonChanges) {
      if (!currentKPIs) return;
      
      // 更新主要KPI值
      this.updateKPICard('avgVisitor', currentKPIs.avgVisitorRatio.toFixed(2) + '%');
      this.updateKPICard('avgCart', currentKPIs.avgCartRatio.toFixed(2) + '%');
      this.updateKPICard('avgPay', currentKPIs.avgPayRatio.toFixed(2) + '%');
      this.updateKPICard('totalProducts', currentKPIs.totalProducts);
      this.updateKPICard('cartedProducts', currentKPIs.cartedProducts);
      this.updateKPICard('purchasedProducts', currentKPIs.purchasedProducts);
      
      // 如果有对比数据，显示变化趋势
      if (comparisonChanges) {
        this.updateKPICardComparison('avgVisitor', comparisonChanges.avgVisitorRatio);
        this.updateKPICardComparison('avgCart', comparisonChanges.avgCartRatio);
        this.updateKPICardComparison('avgPay', comparisonChanges.avgPayRatio);
        this.updateKPICardComparison('totalProducts', comparisonChanges.totalProducts);
        this.updateKPICardComparison('cartedProducts', comparisonChanges.cartedProducts);
        this.updateKPICardComparison('purchasedProducts', comparisonChanges.purchasedProducts);
      }
    }

    // 更新KPI卡片对比数据
    updateKPICardComparison(kpiId, change) {
      const comparisonElement = document.getElementById(kpiId + 'Comparison');
      if (comparisonElement && change !== undefined) {
        const isPercentage = kpiId.includes('Ratio');
        const changeValue = isPercentage ? change.toFixed(2) : change;
        const changeText = isPercentage ? `${changeValue}%` : changeValue;
        const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
        const color = change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500';
        
        comparisonElement.innerHTML = `
          <span class="${color} text-sm">
            ${arrow} ${changeText}
          </span>
        `;
      }
    }

    // 更新KPI卡片（原始方法，保留兼容性）
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

     // 验证KPI卡片是否正确显示
     verifyKPICards() {
       const kpiIds = ['avgVisitor', 'avgCart', 'avgPay', 'totalProducts', 'cartedProducts', 'purchasedProducts'];
       const results = {};
       
       kpiIds.forEach(id => {
         const element = document.getElementById(id);
         if (element) {
           results[id] = {
             exists: true,
             value: element.textContent,
             isEmpty: !element.textContent || element.textContent === '0' || element.textContent === '0%'
           };
         } else {
           results[id] = { exists: false, value: null, isEmpty: true };
         }
       });
       
       console.log('KPI验证结果:', results);
       
       // 如果有空的KPI，尝试重新应用
       const emptyKPIs = Object.entries(results).filter(([id, result]) => result.isEmpty);
       if (emptyKPIs.length > 0) {
         console.warn('发现空的KPI:', emptyKPIs.map(([id]) => id));
         // 这里可以添加重新计算的逻辑
       }
       
       return results;
     }

     // 添加商品链接样式
     addProductLinkStyles() {
       // 检查是否已经有样式
       if (document.getElementById('product-link-styles')) {
         return;
       }
       
       const style = document.createElement('style');
       style.id = 'product-link-styles';
       style.textContent = `
         .product-link {
           color: #007bff !important;
           text-decoration: underline !important;
           cursor: pointer !important;
           font-weight: 500 !important;
         }
         .product-link:hover {
           color: #0056b3 !important;
           text-decoration: none !important;
         }
         .product-id-cell {
           text-align: left !important;
         }
       `;
       document.head.appendChild(style);
       console.log('商品链接样式已添加');
     }

         // 渲染数据表格
     async renderDataTable(data, granularity) {
       if (!data || !Array.isArray(data)) return;
       
       const table = document.getElementById('report');
       if (!table) return;

       console.log('开始渲染数据表格，数据量:', data.length);

       // 第一步：彻底销毁DataTable实例
       if (this.dataTable) {
         try {
           this.dataTable.destroy();
           this.dataTable = null;
           console.log('DataTable实例已销毁');
         } catch (error) {
           console.warn('销毁DataTable实例时出错:', error);
         }
       }

       // 第二步：清理所有DataTables相关的DOM元素
       const tableContainer = table.parentNode;
       if (tableContainer) {
         // 查找并移除所有DataTables相关的元素
         const dataTableSelectors = [
           '.dataTables_wrapper',
           '.dataTables_filter', 
           '.dataTables_length',
           '.dataTables_info',
           '.dataTables_paginate',
           '.dataTables_processing',
           '.dataTables_scroll',
           '.dataTables_scrollHead',
           '.dataTables_scrollBody',
           '.dataTables_scrollFoot'
         ];
         
         dataTableSelectors.forEach(selector => {
           const elements = tableContainer.querySelectorAll(selector);
           elements.forEach(element => {
             element.remove();
             console.log('移除DataTables元素:', selector);
           });
         });
         
         // 移除表格周围的DataTables相关元素
         const siblings = Array.from(tableContainer.children);
         siblings.forEach(sibling => {
           if (sibling !== table && sibling.className && 
               sibling.className.includes('dataTables')) {
             sibling.remove();
             console.log('移除DataTables兄弟元素:', sibling.className);
           }
         });
       }

       // 第三步：重置表格本身
       table.innerHTML = '';
       table.className = '';
       table.removeAttribute('width');
       table.removeAttribute('cellspacing');
       table.removeAttribute('cellpadding');
       table.removeAttribute('style');
       table.removeAttribute('data-page');
       table.removeAttribute('data-page-size');
       
       // 确保表格有正确的ID
       if (!table.id) {
         table.id = 'report';
       }
       
       // 添加调试信息
       console.log('表格清理完成，当前表格状态:', {
         id: table.id,
         className: table.className,
         innerHTML: table.innerHTML.length,
         parentChildren: tableContainer ? tableContainer.children.length : 'N/A'
       });

      // 创建表头 - 确保与HTML中的列数完全匹配
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th style="text-align: left; min-width: 120px;">商品(ID)</th>
          <th style="text-align: center; min-width: 150px;">周期</th>
          <th style="text-align: center; min-width: 100px;">访客比(%)</th>
          <th style="text-align: center; min-width: 100px;">加购比(%)</th>
          <th style="text-align: center; min-width: 100px;">支付比(%)</th>
          <th style="text-align: center; min-width: 80px;">曝光量</th>
          <th style="text-align: center; min-width: 80px;">访客数</th>
          <th style="text-align: center; min-width: 80px;">浏览量</th>
          <th style="text-align: center; min-width: 80px;">加购人数</th>
          <th style="text-align: center; min-width: 100px;">下单商品件数</th>
          <th style="text-align: center; min-width: 80px;">支付件数</th>
          <th style="text-align: center; min-width: 80px;">支付买家数</th>
          <th style="text-align: center; min-width: 100px;">搜索点击率(%)</th>
          <th style="text-align: center; min-width: 120px;">平均停留时长(秒)</th>
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
           
           // 创建商品ID链接
           const productId = row.product_id || '';
           const productLink = productId ? 
             `<a href="https://www.aliexpress.com/item/${productId}.html" target="_blank" class="product-link">${productId}</a>` : 
             '';
           
           // 调试：输出当前行的字段信息
           if (index < 3) {
             console.log(`行${index + 1}数据字段:`, {
               product_id: row.product_id,
               bucket: row.bucket,
               visitor_ratio: row.visitor_ratio,
               cart_ratio: row.cart_ratio,
               pay_ratio: row.pay_ratio,
               exposure: row.exposure,
               visitors: row.visitors,
               page_views: row.page_views,
               cart_users: row.cart_users,
               order_items: row.order_items,
               pay_items: row.pay_items,
               pay_buyers: row.pay_buyers,
               search_ctr: row.search_ctr,
               avg_stay_seconds: row.avg_stay_seconds
             });
           }
           
           tr.innerHTML = `
             <td style="text-align: left;">${productLink}</td>
             <td style="text-align: center;">${row.bucket || this.formatDateRange(row.start_date, row.end_date)}</td>
             <td style="text-align: center;">${this.formatPercentage(row.visitor_ratio)}</td>
             <td style="text-align: center;">${this.formatPercentage(row.cart_ratio)}</td>
             <td style="text-align: center;">${this.formatPercentage(row.pay_ratio)}</td>
             <td style="text-align: center;">${this.formatNumber(row.exposure || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.visitors || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.page_views || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.cart_users || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.order_items || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.pay_items || 0)}</td>
             <td style="text-align: center;">${this.formatNumber(row.pay_buyers || 0)}</td>
             <td style="text-align: center;">${this.formatPercentage(row.search_ctr)}</td>
             <td style="text-align: center;">${this.formatNumber(row.avg_stay_seconds || 0)}</td>
           `;
           tbody.appendChild(tr);
         });
      }
      table.appendChild(tbody);

             // 等待DOM更新完成后再初始化DataTable
       await new Promise(resolve => setTimeout(resolve, 500));
       
       // 添加商品链接样式
       this.addProductLinkStyles();

       // 初始化DataTable
       if (window.jQuery && jQuery.fn.DataTable) {
         try {
           // 再次检查是否已经有DataTable实例
           if (jQuery(table).hasClass('dataTable')) {
             console.log('表格已经是DataTable实例，跳过初始化');
             return;
           }

           // 检查表格结构是否完整
           const thead = table.querySelector('thead');
           const tbody = table.querySelector('tbody');
           
           if (!thead || !tbody) {
             console.error('表格结构不完整，跳过DataTable初始化');
             console.log('表格结构检查:', { thead: !!thead, tbody: !!tbody });
             return;
           }

           // 检查表格是否有数据行
           const rows = tbody.querySelectorAll('tr');
           if (rows.length === 0) {
             console.warn('表格没有数据行，跳过DataTable初始化');
             return;
           }

           console.log('表格结构验证通过，开始初始化DataTable...');
           console.log('表头列数:', thead.querySelectorAll('th').length);
           console.log('数据行数:', rows.length);

                                               // 使用标准配置，确保功能完整，明确指定数据源
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
               autoWidth: false,
               // 明确指定数据源，防止DataTables自动获取数据
               data: [], // 空数据，因为我们已经手动填充了HTML
               // 明确指定列配置，确保列数匹配
               columnDefs: [
                 { targets: 0, className: 'product-id-cell', width: '120px' }, // 商品ID列
                 { targets: 1, width: '150px' }, // 周期列
                 { targets: [2,3,4], width: '100px' }, // 比率列
                 { targets: [5,6,7,8,10,11], width: '80px' }, // 数字列
                 { targets: 9, width: '100px' }, // 下单商品件数列
                 { targets: 12, width: '100px' }, // 搜索点击率列
                 { targets: 13, width: '120px' }  // 平均停留时长列
               ],
               // 确保列数正确，使用HTML表格数据而不是DataTables数据
               columns: [
                 { title: '商品(ID)', data: null, orderable: true, defaultContent: '' },
                 { title: '周期', data: null, orderable: true, defaultContent: '' },
                 { title: '访客比(%)', data: null, orderable: true, defaultContent: '' },
                 { title: '加购比(%)', data: null, orderable: true, defaultContent: '' },
                 { title: '支付比(%)', data: null, orderable: true, defaultContent: '' },
                 { title: '曝光量', data: null, orderable: true, defaultContent: '' },
                 { title: '访客数', data: null, orderable: true, defaultContent: '' },
                 { title: '浏览量', data: null, orderable: true, defaultContent: '' },
                 { title: '加购人数', data: null, orderable: true, defaultContent: '' },
                 { title: '下单商品件数', data: null, orderable: true, defaultContent: '' },
                 { title: '支付件数', data: null, orderable: true, defaultContent: '' },
                 { title: '支付买家数', data: null, orderable: true, defaultContent: '' },
                 { title: '搜索点击率(%)', data: null, orderable: true, defaultContent: '' },
                 { title: '平均停留时长(秒)', data: null, orderable: true, defaultContent: '' }
               ]
             });
           
                       console.log('DataTable初始化成功！');
            console.log('数据行数:', this.dataTable.data().count());
            
            // 验证列数
            const columnCount = this.dataTable.columns().count();
            console.log('DataTable列数:', columnCount);
            
            if (columnCount !== 14) {
               console.error('列数不匹配！期望14列，实际:', columnCount);
               // 如果列数不匹配，尝试重新初始化
               this.dataTable.destroy();
               this.dataTable = null;
               throw new Error(`列数不匹配：期望14列，实际${columnCount}列`);
            }
            
            console.log('列数验证通过，DataTable初始化完成');
           
         } catch (error) {
           console.error('DataTable初始化失败:', error);
           
           // 如果初始化失败，尝试使用最基本的配置
           try {
             console.log('尝试使用基本配置初始化DataTable...');
             this.dataTable = jQuery(table).DataTable({
               destroy: true,
               pageLength: 10,
               ordering: false,
               searching: false,
               info: false,
               paging: false
             });
             console.log('使用基本配置初始化DataTable成功');
           } catch (fallbackError) {
             console.error('基本配置初始化也失败:', fallbackError);
             console.log('表格将保持为普通HTML表格');
           }
         }
       } else {
         console.warn('jQuery或DataTables未加载');
       }
    }

    // 获取对比数据
    async fetchComparisonData(dateRange) {
      try {
        // 计算上一周期
        const prevStart = new Date(dateRange.start);
        prevStart.setDate(prevStart.getDate() - 30);
        const prevEnd = new Date(dateRange.start);
        prevEnd.setDate(prevEnd.getDate() - 1);

        const prevData = await this.fetchAggregatedData(
          prevStart.toISOString().slice(0, 10),
          prevEnd.toISOString().slice(0, 10),
          'day'
        );

        console.log('对比数据获取完成:', {
          period: `${prevStart.toISOString().slice(0, 10)} to ${prevEnd.toISOString().slice(0, 10)}`,
          records: prevData.length
        });

        return prevData;
      } catch (error) {
        console.warn('对比数据获取失败:', error);
        return [];
      }
    }

    // 加载对比数据（保留兼容性）
    async loadComparisonData(dateRange) {
      return await this.fetchComparisonData(dateRange);
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
      
      // 绑定刷新按钮事件
      this.bindRefreshButton();
      
      // 防止重复加载
      if (this.pageReadyTriggered) {
        console.log('页面就绪事件已触发过，跳过重复加载');
        return;
      }
      this.pageReadyTriggered = true;
      
      // 开始加载数据
      this.loadData();
    }

    // 绑定刷新按钮事件
    bindRefreshButton() {
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          console.log('刷新按钮被点击，重新加载数据');
          this.loadData();
        });
        console.log('刷新按钮事件已绑定');
      }
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
        // 重新加载数据而不是调用未定义的方法
        this.loadData();
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

    // 重构数据加载逻辑，与index.html保持一致
    async fetchAndRenderAll() {
      try {
        console.log('开始加载所有数据...');
        
        // 获取日期范围
        const { from, to } = this.getDateRange();
        const startISO = from;
        const endISO = to;
        
        // 计算对比周期
        const { prevStart, prevEnd, days } = this.periodShift(startISO, endISO);
        
        console.log('当前周期:', startISO, 'to', endISO);
        console.log('对比周期:', prevStart, 'to', prevEnd);
        
        // 使用Promise.all并行获取数据，避免多次调用
        const [rowsAggA, rowsAggB] = await Promise.all([
          this.fetchAggregatedData(startISO, endISO, 'day'),
          this.fetchAggregatedData(prevStart, prevEnd, 'day')
        ]);
        
        console.log('成功获取数据:', {
          '当前周期': rowsAggA.length,
          '对比周期': rowsAggB.length
        });
        
        // 一次性计算所有KPI
        this.computeCards(rowsAggA, rowsAggB);
        
        // 渲染数据表格
        await this.renderTable(rowsAggA, 'day');
        
        // 更新状态
        this.updateStatus('加载完成');
        
      } catch (error) {
        console.error('数据加载失败:', error);
        this.updateStatus('加载失败：' + (error.message || error));
        this.showError('查询失败：' + (error.message || error));
      }
    }
    
    // 计算对比周期（与index.html保持一致）
    periodShift(startISO, endISO) {
      const start = new Date(startISO + 'T00:00:00');
      const end = new Date(endISO + 'T00:00:00');
      const days = Math.round((end - start) / 86400000) + 1;
      const prevEnd = new Date(start.getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - (days-1)*86400000);
      const fmt = d => d.toISOString().slice(0,10);
      return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd), days };
    }
    
    // 计算KPI卡片（与index.html保持一致）
    computeCards(rows, prevRows) {
      function summarize(rs) {
        if (!rs.length) return {vr:0,cr:0,pr:0,total:0,pc:0,pp:0};
        
        const sum = rs.reduce((a,b) => ({
          exposure: a.exposure + (b.exposure || 0),
          visitors: a.visitors + (b.visitors || 0),
          add_people: a.add_people + (b.add_people || 0),
          pay_buyers: a.pay_buyers + (b.pay_buyers || 0)
        }), {exposure:0,visitors:0,add_people:0,pay_buyers:0});
        
        const products = new Map();
        rs.forEach(r => {
          if (!products.has(r.product_id)) {
            products.set(r.product_id, {exp:0,add:0,pay:0});
          }
          const acc = products.get(r.product_id);
          acc.exp += r.exposure || 0;
          acc.add += r.add_people || 0;
          acc.pay += r.pay_buyers || 0;
        });
        
        let pe = 0, pc = 0, pp = 0;
        products.forEach(v => {
          if (v.exp > 0) pe++;
          if (v.add > 0) pc++;
          if (v.pay > 0) pp++;
        });
        
        const vr = sum.exposure > 0 ? ((sum.visitors / sum.exposure) * 100) : 0;
        const cr = sum.visitors > 0 ? ((sum.add_people / sum.visitors) * 100) : 0;
        const pr = sum.add_people > 0 ? ((sum.pay_buyers / sum.add_people) * 100) : 0;
        
        return {vr, cr, pr, total: products.size, pc, pp};
      }
      
      function setDelta(id, diff, isPercent) {
        const el = document.getElementById(id);
        if (!el) return;
        
        const arrow = diff >= 0 ? '↑' : '↓';
        const cls = diff >= 0 ? 'delta up' : 'delta down';
        const val = isPercent ? Math.abs(diff).toFixed(2) + '%' : Math.abs(diff).toString();
        
        el.innerHTML = `<span class="${cls}">${arrow} ${val}</span>`;
      }
      
      const cur = summarize(rows);
      const prev = summarize(prevRows || []);
      
      // 更新KPI值
      this.updateKPI('avgVisitor', cur.vr.toFixed(2) + '%');
      this.updateKPI('avgCart', cur.cr.toFixed(2) + '%');
      this.updateKPI('avgPay', cur.pr.toFixed(2) + '%');
      this.updateKPI('totalProducts', cur.total);
      this.updateKPI('cartedProducts', cur.pc);
      this.updateKPI('purchasedProducts', cur.pp);
      
      // 更新对比数据
      setDelta('avgVisitorComparison', cur.vr - prev.vr, true);
      setDelta('avgCartComparison', cur.cr - prev.cr, true);
      setDelta('avgPayComparison', cur.pr - prev.pr, true);
      setDelta('totalProductsComparison', cur.total - prev.total, false);
      setDelta('cartedProductsComparison', cur.pc - prev.pc, false);
      setDelta('purchasedProductsComparison', cur.pp - prev.pp, false);
      
      console.log('KPI计算完成:', { cur, prev });
    }
    
    // 更新KPI值
    updateKPI(id, value) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    }
    
    // 更新状态
    updateStatus(message) {
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = message;
      }
    }
  }

  // 等待页面模板系统加载
  waitForPageManager();

})();
