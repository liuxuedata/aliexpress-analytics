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
            console.log(`计算访客比: ${row.visitors}/${row.exposure} = ${finalVisitorRatio.toFixed(2)}%`);
          }
          
          // 计算加购比：加购人数/访客数
          if (!cartRatio && row.visitors && row.cart_users && row.visitors > 0) {
            finalCartRatio = (row.cart_users / row.visitors) * 100;
            console.log(`计算加购比: ${row.cart_users}/${row.visitors} = ${finalCartRatio.toFixed(2)}%`);
          }
          
          // 计算支付比：支付买家数/加购人数
          if (!payRatio && row.cart_users && row.pay_buyers && row.cart_users > 0) {
            finalPayRatio = (row.pay_buyers / row.cart_users) * 100;
            console.log(`计算支付比: ${row.pay_buyers}/${row.cart_users} = ${finalPayRatio.toFixed(2)}%`);
          }
          
          // 累加计算
          totalVisitorRatio += finalVisitorRatio;
          totalCartRatio += finalCartRatio;
          totalPayRatio += finalPayRatio;
          totalProducts++;
          
          if (finalCartRatio > 0) cartedProducts++;
          if (finalPayRatio > 0) purchasedProducts++;
          
          // 调试信息
          if (index < 3) {
            console.log(`行${index + 1} KPI计算:`, {
              original: { visitorRatio, cartRatio, payRatio },
              calculated: { finalVisitorRatio, finalCartRatio, finalPayRatio },
              raw: { 
                exposure: row.exposure, 
                visitors: row.visitors, 
                cart_users: row.cart_users, 
                pay_buyers: row.pay_buyers 
              }
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
       
       // 验证KPI更新是否成功
       setTimeout(() => {
         this.verifyKPICards();
       }, 100);
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
           
           // 创建商品ID链接
           const productId = row.product_id || '';
           const productLink = productId ? 
             `<a href="https://www.aliexpress.com/item/${productId}.html" target="_blank" class="product-link">${productId}</a>` : 
             '';
           
           tr.innerHTML = `
             <td>${productLink}</td>
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

                       // 使用标准配置，确保功能完整
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
              // 明确指定列配置，确保列数匹配
              columnDefs: [
                { targets: 0, className: 'product-id-cell' }, // 商品ID列
                { targets: '_all', className: 'text-center' }  // 其他列居中
              ],
              // 确保列数正确
              columns: [
                { title: '商品(ID)', data: 0, orderable: true },
                { title: '周期', data: 1, orderable: true },
                { title: '访客比(%)', data: 2, orderable: true },
                { title: '加购比(%)', data: 3, orderable: true },
                { title: '支付比(%)', data: 4, orderable: true },
                { title: '曝光量', data: 5, orderable: true },
                { title: '访客数', data: 6, orderable: true },
                { title: '浏览量', data: 7, orderable: true },
                { title: '加购人数', data: 8, orderable: true },
                { title: '下单商品件数', data: 9, orderable: true },
                { title: '支付件数', data: 10, orderable: true },
                { title: '支付买家数', data: 11, orderable: true },
                { title: '搜索点击率(%)', data: 12, orderable: true },
                { title: '平均停留时长(秒)', data: 13, orderable: true }
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
