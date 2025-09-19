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
    
    // 将管理器暴露到全局，供page-template.js使用
    window.selfOperatedManager = selfOperatedManager;
    console.log('自运营页面管理器已暴露到全局:', window.selfOperatedManager);
    
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
      this.pageReadyTriggered = false;
    }

    // 重写refreshData方法，确保能正确调用loadData
    async refreshData() {
      console.log('SelfOperatedPageManager.refreshData() 被调用');
      try {
        await this.loadData();
        if (typeof window.fetchAndRenderAll === 'function') {
          await window.fetchAndRenderAll();
        }
      } catch (error) {
        console.error('数据刷新失败:', error);
        this.showError('数据刷新失败，请重试');
      }
    }

    // 更新页面标题显示当前站点名称
    updatePageTitle() {
      // 强制从localStorage获取最新的站点信息，确保页面标题正确
      const currentSite = localStorage.getItem('currentSite') || 'ae_self_operated_a';
      const currentSiteName = localStorage.getItem('currentSiteName') || '自运营robot站';
      
      console.log('更新页面标题，站点信息:', { currentSite, currentSiteName });
      
      // 更新浏览器标题
      const pageTitleEl = document.getElementById('pageTitle');
      if (pageTitleEl) {
        pageTitleEl.textContent = `跨境电商数据分析平台 - ${this.getSiteDisplayName(currentSite, currentSiteName)}`;
      }
      
      // 更新页面主标题（h1元素）
      const mainTitleEl = document.querySelector('h1');
      if (mainTitleEl) {
        mainTitleEl.textContent = `${this.getSiteDisplayName(currentSite, currentSiteName)} - 智能数据分析与决策支持`;
      }
      
      console.log('页面标题已更新为:', this.getSiteDisplayName(currentSite, currentSiteName));
    }
    
    // 获取站点显示名称
    getSiteDisplayName(currentSite, currentSiteName) {
      // 如果是poolslab相关站点，显示更友好的名称
      if (currentSiteName.includes('poolslab') || currentSite === 'ae_self_operated_poolslab_store') {
        return 'Poolslab运动娱乐';
      } else if (currentSiteName.includes('icyberite')) {
        return 'Icyberite科技';
      } else if (currentSiteName.includes('ae_self_operated') || currentSite === 'ae_self_operated_a') {
        return '自运营Robot站';
      }
      return currentSiteName;
    }

    // 数据加载主方法（与index.html保持一致）
    async loadData() {
      try {
        console.log('SelfOperatedPageManager.loadData() 被调用');
        console.log('开始加载所有数据...');
        
        // 更新状态为加载中
        this.updateStatus('数据加载中...', 'loading');
        
        // 获取日期范围
        const { from, to } = this.getDateRange();
        const startISO = from;
        const endISO = to;
        
        // 计算对比周期
        const todayISO = new Date().toISOString().slice(0,10);
        const { prevStart, prevEnd, days } = this.periodShift(startISO, endISO);
        
        console.log('当前周期:', startISO, 'to', endISO);
        console.log('对比周期:', prevStart, 'to', prevEnd);
        
        // 使用Promise.all并行获取数据，并获取累积商品总数
        const [rowsAggA, rowsAggB, totalCur, totalPrev] = await Promise.all([
          this.fetchAggregatedData(startISO, endISO, 'day'),
          this.fetchAggregatedData(prevStart, prevEnd, 'day'),
          this.fetchProductTotal(todayISO),
          this.fetchProductTotal(prevEnd)
        ]);
        
        console.log('成功获取数据:', {
          '当前周期': rowsAggA.length,
          '对比周期': rowsAggB.length
        });
        
        // 保存当前数据，用于后续筛选
        this.currentData = rowsAggA;
        
        // 一次性计算所有KPI
        this.computeCards(rowsAggA, rowsAggB, totalCur, totalPrev);
        
        // 渲染数据表格
        await this.renderDataTable(rowsAggA, 'day');
        
                 // 更新状态为成功
         this.updateStatus('数据加载完成', 'success');
         
         // 数据加载完成后，更新页面标题（确保显示正确的站点名称）
         this.updatePageTitle();
         
         // 数据加载完成后，绑定新品筛选事件
         this.bindNewProductsFilter();
         
       } catch (error) {
         console.error('数据加载失败:', error);
         this.updateStatus('数据加载失败：' + (error.message || error), 'error');
         this.showError('查询失败：' + (error.message || error));
       }
    }

    // 获取日期范围（与index.html保持一致）
    getDateRange() {
      const input = document.getElementById('dateFilter');
      console.log('getDateRange被调用，当前input值:', input ? input.value : 'input不存在');
      
      if (input && input.value && input.value.includes(' to ')) {
        const [from, to] = input.value.split(' to ');
        const result = { from: from.trim(), to: to.trim() };
        console.log('从input获取到日期范围:', result);
        return result;
      }
      
      // 返回默认日期范围（最近7天）
      const today = new Date();
      const to = today.toISOString().slice(0, 10);
      const from = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);

      // 更新日期选择器的值
      if (input) {
        input.value = `${from} to ${to}`;
      }
      
      const result = { from, to };
      console.log('使用默认日期范围:', result);
      return result;
    }

    // 获取聚合数据（使用正确的自运营API接口）
    async fetchAggregatedData(startISO, endISO, granularity) {
      // 获取当前站点信息
      const currentSite = localStorage.getItem('currentSite') || 'ae_self_operated_a';
      const currentSiteName = localStorage.getItem('currentSiteName') || '自运营robot站';
      
      console.log('查询数据，站点信息:', { currentSite, currentSiteName });
      
      const params = new URLSearchParams({
        start: startISO,
        end: endISO,
        granularity: granularity,
        site: currentSite, // 使用站点ID，如 'ae_self_operated_poolslab_store'
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
        
        return rows;
      } catch (error) {
        console.error('API请求失败:', error);
        throw error;
      }
    }

    // 获取平台至今商品总数
    async fetchProductTotal(toISO) {
      // 强制从localStorage获取最新的站点信息，确保使用正确的站点ID
      const currentSite = localStorage.getItem('currentSite') || 'ae_self_operated_a';
      const currentSiteName = localStorage.getItem('currentSiteName') || '自运营robot站';
      
      console.log('查询商品总数，站点信息:', { currentSite, currentSiteName });
      console.log('localStorage中的站点信息:', {
        currentSite: localStorage.getItem('currentSite'),
        currentSiteName: localStorage.getItem('currentSiteName')
      });
      
      const qs = new URLSearchParams({ 
        platform:'self', 
        from:'2000-01-01', 
        to: toISO, 
        limit:5000, 
        site: currentSite // 使用站点ID，如 'ae_self_operated_poolslab_store'
      });
      
      try {
        const r = await fetch('/api/new-products?'+qs.toString());
        const j = await r.json();
        if (j.ok) return (j.items||[]).length;
      } catch (e) { console.error('fetchProductTotal', e); }
      return 0;
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
    
    // 计算KPI卡片（修复字段名和计算逻辑）
    computeCards(rows, prevRows, totalCur, totalPrev) {
      function summarize(rs) {
        if (!rs.length) return {vr:0,cr:0,pr:0,total:0,pe:0,pc:0,pp:0};

        // 调试：输出前几条数据的字段
        if (rs.length > 0) {
          console.log('KPI计算调试 - 第一条数据字段:', rs[0]);
          console.log('KPI计算调试 - 关键字段值:', {
            exposure: rs[0].exposure,
            visitors: rs[0].visitors,
            add_people: rs[0].add_people,
            add_count: rs[0].add_count,
            pay_buyers: rs[0].pay_buyers,
            pay_items: rs[0].pay_items,
            pay_orders: rs[0].pay_orders
          });
        }

        // 使用与 index.html 一致的字段名，额外跟踪加购/支付次数
        const sum = rs.reduce((a,b) => ({
          exposure: a.exposure + (b.exposure || 0),
          visitors: a.visitors + (b.visitors || 0),
          add_people: a.add_people + (b.add_people || 0),
          add_count: a.add_count + (b.add_count || 0),
          pay_buyers: a.pay_buyers + (b.pay_buyers || 0),
          pay_items: a.pay_items + (b.pay_items || 0),
          pay_orders: a.pay_orders + (b.pay_orders || 0)
        }), {exposure:0,visitors:0,add_people:0,add_count:0,pay_buyers:0,pay_items:0,pay_orders:0});

        console.log('KPI计算调试 - 汇总数据:', sum);

        const products = new Map();
        rs.forEach(r => {
          if (!products.has(r.product_id)) {
            products.set(r.product_id, { exp:0, addPeople:0, addCount:0, payBuyers:0, payItems:0, payOrders:0 });
          }
          const acc = products.get(r.product_id);
          acc.exp += r.exposure || 0;
          acc.addPeople += r.add_people || 0;
          acc.addCount += r.add_count || 0;
          acc.payBuyers += r.pay_buyers || 0;
          acc.payItems += r.pay_items || 0;
          acc.payOrders += r.pay_orders || 0;
        });

        let pe = 0, pc = 0, pp = 0;
        products.forEach(v => {
          if (v.exp > 0) pe++;
          if (v.addPeople > 0) pc++;
          if ((v.payItems || 0) + (v.payOrders || 0) > 0) pp++;
        });

        // 修复计算逻辑：使用与index.html一致的字段名
        const vr = sum.exposure > 0 ? (sum.visitors / sum.exposure) : 0;
        const cr = sum.visitors > 0 ? (sum.add_people / sum.visitors) : 0;  // 使用 add_people
        const pr = sum.add_people > 0 ? (sum.pay_buyers / sum.add_people) : 0;  // 使用 add_people 和 pay_buyers

        console.log('KPI计算调试 - 计算结果:', { vr, cr, pr, total: products.size, pe, pc, pp });

        return {vr, cr, pr, total: products.size, pe, pc, pp, newProducts: 0}; // 暂时返回0，后续计算
      }
      
      const setDelta = (id, diff, isPercent) => {
        const el = document.getElementById(id);
        if (!el) return;

        const arrow = diff >= 0 ? '↑' : '↓';
        const cls = diff >= 0 ? 'delta up' : 'delta down';
        const val = isPercent
          ? this.formatPercentage(Math.abs(diff))
          : Math.abs(diff).toString();

        el.innerHTML = `<span class="${cls}">${arrow} ${val}</span>`;
      };
      
      const cur = summarize(rows);
      const prev = summarize(prevRows || []);
      cur.total = totalCur || 0;
      prev.total = totalPrev || 0;
      
      // 计算本周期新品数：当前周期有但对比周期没有的商品
      const currentProductIds = new Set(rows.map(r => r.product_id));
      const prevProductIds = new Set((prevRows || []).map(r => r.product_id));
      const newProductIds = Array.from(currentProductIds).filter(id => !prevProductIds.has(id));
      const newProducts = newProductIds.length;
      
      // 保存新品ID列表，用于后续筛选
      this.newProductIds = newProductIds;
      
      console.log('本周期新品数计算:', {
        currentProductIds: currentProductIds.size,
        prevProductIds: prevProductIds.size,
        newProducts: newProducts,
        newProductIds: newProductIds
      });
      
      // 更新KPI值
      this.updateKPI('avgVisitor', this.formatPercentage(cur.vr));
      this.updateKPI('avgCart', this.formatPercentage(cur.cr));
      this.updateKPI('avgPay', this.formatPercentage(cur.pr));
      this.updateKPI('totalProducts', cur.total);
      this.updateKPI('exposedProducts', cur.pe);
      this.updateKPI('cartedProducts', cur.pc);
      this.updateKPI('purchasedProducts', cur.pp);
      this.updateKPI('newProducts', newProducts); // 添加新品数KPI
      
             // 更新对比数据
       setDelta('avgVisitorComparison', cur.vr - prev.vr, true);
       setDelta('avgCartComparison', cur.cr - prev.cr, true);
       setDelta('avgPayComparison', cur.pr - prev.pr, true);
       setDelta('totalProductsComparison', cur.total - prev.total, false);
       setDelta('exposedProductsComparison', cur.pe - prev.pe, false);
       setDelta('cartedProductsComparison', cur.pc - prev.pc, false);
       setDelta('purchasedProductsComparison', cur.pp - prev.pp, false);
       
       // 新品KPI卡片不需要和上期对比，直接显示当前周期新品数
       // 不调用setDelta，保持新品数显示
      
      // 调试：输出KPI更新结果
      console.log('KPI更新结果:', {
        avgVisitor: this.formatPercentage(cur.vr),
        avgCart: this.formatPercentage(cur.cr),
        avgPay: this.formatPercentage(cur.pr),
        totalProducts: cur.total,
        exposedProducts: cur.pe,
        cartedProducts: cur.pc,
        purchasedProducts: cur.pp
      });
      
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
    updateStatus(message, type = 'success') {
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = message;
      }
      
      // 更新状态显示器的样式
      const statusDisplay = document.getElementById('statusDisplay');
      if (statusDisplay) {
        statusDisplay.textContent = message;
        statusDisplay.className = `status-display ${type}`;
      }
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

    // 渲染数据表格（简化版本，与index.html保持一致）
    async renderDataTable(data, granularity) {
      if (!data || !Array.isArray(data)) return;
      
      const table = document.getElementById('report');
      if (!table) return;

      console.log('开始渲染数据表格，数据量:', data.length);

      // 简单清理：只销毁DataTable实例和清空表格内容
      if (this.dataTable) {
        try {
          this.dataTable.destroy();
          this.dataTable = null;
          console.log('DataTable实例已销毁');
        } catch (error) {
          console.warn('销毁DataTable实例时出错:', error);
        }
      }
      
      // 清空表格内容（与index.html保持一致）
      table.innerHTML = '';

      // 创建表头
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
          <th style="text-align: center; min-width: 80px;">加购件数</th>
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
         const tr = document.createElement('tr');
         tr.innerHTML = '<td colspan="14" style="text-align: center; padding: 20px; color: #666;">暂无数据</td>';
         tbody.appendChild(tr);
         
         // 如果没有数据，不初始化DataTable，避免列数错误
         console.log('没有数据，跳过DataTable初始化');
         return;
       } else {
        data.forEach((row, index) => {
          const tr = document.createElement('tr');
          
          // 创建商品ID链接
          const productId = row.product_id || '';
          const productLink = productId ? 
            `<a href="https://www.aliexpress.com/item/${productId}.html" target="_blank" class="product-link">${productId}</a>` : 
            '';
          
          // 计算比率，优先使用 add_people
          const addPeople = row.add_people || 0;
          const visitors = row.visitors || 0;
          const exposure = row.exposure || 0;
          const payItems = row.pay_items || 0;
          const visitorRatio = exposure > 0 ? (visitors / exposure) : 0;
          const addToCartRatio = visitors > 0 ? (addPeople / visitors) : 0;
          const paymentRatio = addPeople > 0 ? (payItems / addPeople) : 0;

          // 调试：输出前3行的详细数据
          if (index < 3) {
            console.log(`行${index + 1}数据字段:`, {
              product_id: row.product_id,
              bucket: row.bucket,
              visitor_ratio: visitorRatio,
              add_to_cart_ratio: addToCartRatio,
              payment_ratio: paymentRatio,
              exposure: row.exposure,
              visitors: row.visitors,
              views: row.views,
              add_people: row.add_people,
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
            <td style="text-align: center;">${this.formatPercentage(visitorRatio)}</td>
            <td style="text-align: center;">${this.formatPercentage(addToCartRatio)}</td>
            <td style="text-align: center;">${this.formatPercentage(paymentRatio)}</td>
            <td style="text-align: center;">${this.formatNumber(row.exposure || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.visitors || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.views || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(addPeople)}</td>
            <td style="text-align: center;">${this.formatNumber(row.order_items || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.pay_items || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.pay_buyers || 0)}</td>
            <td style="text-align: center;">${this.formatPercentage(row.search_ctr)}</td>
            <td style="text-align: center;">${this.formatNumber(row.avg_stay_seconds || 0)}</td>
          `;
          
          // 为每行数据添加双击事件（排除商品ID列）
          tr.addEventListener('dblclick', (e) => {
            // 如果点击的是商品ID列，不处理
            if (e.target.cellIndex === 0) return;

            // 获取商品ID
            const productId = row.product_id;
            if (productId) {
              console.log('双击行数据，跳转到本页产品分析:', productId);
              // 保存选中的产品ID供产品分析页使用
              localStorage.setItem('selectedProductId', productId);
              // 跳转到自运营页面的产品分析标签页
              window.location.href = `self-operated.html#products`;
            }
          });
          
          // 为每行添加鼠标悬停效果
          tr.style.cursor = 'pointer';
          tr.title = '双击查看产品分析';
          
          tbody.appendChild(tr);
        });
      }
      table.appendChild(tbody);

      // 添加商品链接样式
      this.addProductLinkStyles();

              // 使用与index.html相同的DataTable配置
        if (window.jQuery && jQuery.fn.DataTable) {
          try {
            // 等待DOM更新完成
            await new Promise(resolve => setTimeout(resolve, 100));
            
                         // 检查表格是否有数据行（排除"暂无数据"行）
             const tbody = table.querySelector('tbody');
             const rows = tbody ? tbody.querySelectorAll('tr') : [];
             const dataRows = Array.from(rows).filter(row => 
               !row.textContent.includes('暂无数据') && row.cells.length > 1
             );
             console.log('表格实际行数:', rows.length, '数据行数:', dataRows.length);
             
             // 如果表格有实际数据行，使用正确的DataTable配置
             if (dataRows.length > 0) {
              this.dataTable = jQuery(table).DataTable({
                destroy: true,
                pageLength: 10,
                order: [[1, 'desc']], 
                scrollX: true, 
                scrollY: 'calc(100vh - 420px)', 
                scrollCollapse: true, 
                fixedHeader: true,
                language: {
                  url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/zh.json'
                }
              });
              
              console.log('DataTable初始化成功！');
              console.log('DataTable数据行数:', this.dataTable.data().count());
              console.log('DataTable实际显示行数:', this.dataTable.rows().count());
              
                         } else {
               console.warn('表格没有实际数据行，跳过DataTable初始化');
               // 如果没有数据，显示"暂无数据"提示
               if (tbody) {
                 tbody.innerHTML = '<tr><td colspan="14" style="text-align: center; padding: 20px; color: #666;">暂无数据</td></tr>';
               }
             }
            
          } catch (error) {
            console.error('DataTable初始化失败:', error);
          }
        } else {
          console.warn('jQuery或DataTables未加载');
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
       
       // 更新页面标题显示当前站点名称
       this.updatePageTitle();
       
       // 防止重复加载
       if (this.pageReadyTriggered) {
         console.log('页面就绪事件已触发过，跳过重复加载');
         return;
       }
       this.pageReadyTriggered = true;
       
       // 开始加载数据
       this.loadData();
     }

  
      
      // 绑定新品KPI卡片点击事件
      bindNewProductsFilter() {
        console.log('开始绑定新品筛选事件...');
        
        const newProductsCard = document.getElementById('newProducts');
        console.log('新品KPI卡片元素:', newProductsCard);
        
        if (newProductsCard) {
          // 移除旧的事件监听器（如果存在）
          newProductsCard.removeEventListener('click', this._newProductsClickHandler);
          
          // 创建新的事件处理函数
          this._newProductsClickHandler = () => {
            console.log('新品KPI卡片被点击，筛选新品数据');
            this.filterNewProducts();
          };
          
          // 绑定点击事件
          newProductsCard.addEventListener('click', this._newProductsClickHandler);
          console.log('新品KPI卡片事件已绑定');
          
          // 添加视觉反馈
          newProductsCard.style.cursor = 'pointer';
          newProductsCard.title = '点击筛选新品数据';
        } else {
          console.warn('未找到新品KPI卡片元素');
        }
        
        // 绑定清除筛选链接事件
        const clearLink = document.getElementById('clearNewProductsFilter');
        console.log('清除筛选链接元素:', clearLink);
        
        if (clearLink) {
          // 移除旧的事件监听器（如果存在）
          clearLink.removeEventListener('click', this._clearFilterClickHandler);
          
          // 创建新的事件处理函数
          this._clearFilterClickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('清除新品筛选链接被点击，恢复完整数据');
            this.clearNewProductsFilter();
          };
          
          // 绑定点击事件
          clearLink.addEventListener('click', this._clearFilterClickHandler);
          console.log('清除新品筛选链接事件已绑定');
        } else {
          console.warn('未找到清除筛选链接元素');
        }
        
        console.log('新品筛选事件绑定完成');
      }
      
      // 筛选新品数据
      filterNewProducts() {
        console.log('开始筛选新品数据...');
        console.log('this.newProductIds:', this.newProductIds);
        console.log('this.currentData:', this.currentData);
        
        if (!this.newProductIds || this.newProductIds.length === 0) {
          console.log('没有新品数据可筛选');
          this.showError('没有新品数据可筛选');
          return;
        }
        
        if (!this.currentData || this.currentData.length === 0) {
          console.log('没有当前数据可筛选');
          this.showError('没有当前数据可筛选');
          return;
        }
        
        // 筛选出新品数据
        const filteredData = this.currentData.filter(row => 
          this.newProductIds.includes(row.product_id)
        );
        
        console.log('新品筛选结果:', {
          totalData: this.currentData.length,
          filteredData: filteredData.length,
          newProductIds: this.newProductIds,
          filteredData: filteredData
        });
        
        // 重新渲染表格，显示筛选后的数据
        this.renderDataTable(filteredData, 'day');
        
        // 显示新品筛选状态
        this.showNewProductsFilterStatus(filteredData.length);
        
        // 更新状态显示
        this.updateStatus(`新品筛选：显示 ${filteredData.length} 条记录`, 'success');
        
        console.log('新品筛选完成');
      }
      
      // 显示新品筛选状态
      showNewProductsFilterStatus(count) {
        const clearDiv = document.getElementById('newProductsClear');
        if (clearDiv) {
          clearDiv.style.display = 'block';
          console.log('显示新品清除筛选链接');
        }
      }
      
      // 清除新品筛选，恢复完整数据
      clearNewProductsFilter() {
        console.log('清除新品筛选，恢复完整数据');
        
        // 隐藏清除筛选链接
        const clearDiv = document.getElementById('newProductsClear');
        if (clearDiv) {
          clearDiv.style.display = 'none';
        }
        
        // 重新渲染完整数据表格
        this.renderDataTable(this.currentData, 'day');
        
        // 恢复状态显示
        this.updateStatus('数据加载完成', 'success');
      }
  }

  // 等待页面模板系统加载
  waitForPageManager();

})();
