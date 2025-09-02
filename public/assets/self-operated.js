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
      this.pageReadyTriggered = false;
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
        await this.renderDataTable(rowsAggA, 'day');
        
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

    // 获取聚合数据（使用正确的自运营API接口）
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
        
        return rows;
      } catch (error) {
        console.error('API请求失败:', error);
        throw error;
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
    
    // 计算KPI卡片（修复字段名和计算逻辑）
    computeCards(rows, prevRows) {
      function summarize(rs) {
        if (!rs.length) return {vr:0,cr:0,pr:0,total:0,pc:0,pp:0};
        
        // 调试：输出前几条数据的字段
        if (rs.length > 0) {
          console.log('KPI计算调试 - 第一条数据字段:', rs[0]);
          console.log('KPI计算调试 - 关键字段值:', {
            exposure: rs[0].exposure,
            visitors: rs[0].visitors,
            add_count: rs[0].add_count,
            pay_items: rs[0].pay_items,
            add_people: rs[0].add_people
          });
        }
        
        const sum = rs.reduce((a,b) => ({
          exposure: a.exposure + (b.exposure || 0),
          visitors: a.visitors + (b.visitors || 0),
          add_count: a.add_count + (b.add_count || 0),
          pay_items: a.pay_items + (b.pay_items || 0)
        }), {exposure:0,visitors:0,add_count:0,pay_items:0});
        
        console.log('KPI计算调试 - 汇总数据:', sum);
        
        const products = new Map();
        rs.forEach(r => {
          if (!products.has(r.product_id)) {
            products.set(r.product_id, {exp:0,add:0,pay:0});
          }
          const acc = products.get(r.product_id);
          acc.exp += r.exposure || 0;
          acc.add += r.add_count || 0;
          acc.pay += r.pay_items || 0;
        });
        
        let pe = 0, pc = 0, pp = 0;
        products.forEach(v => {
          if (v.exp > 0) pe++;
          if (v.add > 0) pc++;
          if (v.pay > 0) pp++;
        });
        
        // 修复计算逻辑：使用正确的字段名
        const vr = sum.exposure > 0 ? ((sum.visitors / sum.exposure) * 100) : 0;
        const cr = sum.visitors > 0 ? ((sum.add_count / sum.visitors) * 100) : 0;
        const pr = sum.add_count > 0 ? ((sum.pay_items / sum.add_count) * 100) : 0;
        
        console.log('KPI计算调试 - 计算结果:', { vr, cr, pr, total: products.size, pc, pp });
        
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
      
      // 调试：输出KPI更新结果
      console.log('KPI更新结果:', {
        avgVisitor: cur.vr.toFixed(2) + '%',
        avgCart: cur.cr.toFixed(2) + '%',
        avgPay: cur.pr.toFixed(2) + '%',
        totalProducts: cur.total,
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
    updateStatus(message) {
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = message;
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
      } else {
        data.forEach((row, index) => {
          const tr = document.createElement('tr');
          
          // 创建商品ID链接
          const productId = row.product_id || '';
          const productLink = productId ? 
            `<a href="https://www.aliexpress.com/item/${productId}.html" target="_blank" class="product-link">${productId}</a>` : 
            '';
          
          // 调试：输出前3行的详细数据
          if (index < 3) {
            console.log(`行${index + 1}数据字段:`, {
              product_id: row.product_id,
              bucket: row.bucket,
              visitor_ratio: row.visitor_ratio,
              add_to_cart_ratio: row.add_to_cart_ratio,
              payment_ratio: row.payment_ratio,
              exposure: row.exposure,
              visitors: row.visitors,
              views: row.views,
              add_count: row.add_count,
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
            <td style="text-align: center;">${this.formatPercentage(row.add_to_cart_ratio)}</td>
            <td style="text-align: center;">${this.formatPercentage(row.payment_ratio)}</td>
            <td style="text-align: center;">${this.formatNumber(row.exposure || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.visitors || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.views || 0)}</td>
            <td style="text-align: center;">${this.formatNumber(row.add_count || 0)}</td>
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

      // 添加商品链接样式
      this.addProductLinkStyles();

              // 使用与index.html相同的DataTable配置
        if (window.jQuery && jQuery.fn.DataTable) {
          try {
            // 等待DOM更新完成
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 检查表格是否有数据行
            const tbody = table.querySelector('tbody');
            const rows = tbody ? tbody.querySelectorAll('tr') : [];
            console.log('表格实际行数:', rows.length);
            
            // 如果表格有数据行，使用正确的DataTable配置
            if (rows.length > 0) {
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
              console.warn('表格没有数据行，跳过DataTable初始化');
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
  }

  // 等待页面模板系统加载
  waitForPageManager();

})();
