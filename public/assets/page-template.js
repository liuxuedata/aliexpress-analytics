/**
 * 统一页面模板系统
 * 用于管理所有页面的通用功能、UI组件和架构
 */

(function() {
  'use strict';

  // ===== 全局配置 =====
  const CONFIG = {
    // 页面类型映射
    PAGE_TYPES: {
      'self-operated': '自运营',
      'independent-site': '独立站',
      'managed': '全托管',
      'amazon': '亚马逊',
      'tiktok': 'TikTok',
      'temu': 'Temu',
      'ozon': 'Ozon'
    },
    
    // 默认日期范围
    DEFAULT_DATE_RANGE: {
      start: '2025-07-01',
      days: 30
    },
    
    // API端点
    API_ENDPOINTS: {
      self_operated: '/api/ae_query',
      independent: '/api/independent/stats',
      new_products: '/api/new-products'
    }
  };

  // ===== 核心页面管理器 =====
  class PageManager {
    constructor() {
      this.currentPage = this.detectPageType();
      this.currentSite = null;
      this.currentSiteName = null;
      this.isInitialized = false;
      
      this.init();
    }

    // 检测页面类型
    detectPageType() {
      const path = window.location.pathname;
      if (path.includes('self-operated')) return 'self-operated';
      if (path.includes('independent-site')) return 'independent-site';
      if (path.includes('managed')) return 'managed';
      if (path.includes('amazon')) return 'amazon';
      if (path.includes('tiktok')) return 'tiktok';
      if (path.includes('temu')) return 'temu';
      if (path.includes('ozon')) return 'ozon';
      return 'unknown';
    }

    // 初始化页面
    async init() {
      if (this.isInitialized) return;
      
      try {
        console.log(`初始化页面: ${this.currentPage}`);
        console.log('页面URL:', window.location.href);
        
        // 设置页面标题
        this.setPageTitle();
        
        // 初始化站点信息
        await this.initSiteInfo();
        
        // 初始化UI组件
        this.initUIComponents();
        
        // 初始化事件监听
        this.initEventListeners();
        
        // 初始化数据加载
        await this.initDataLoading();
        
        this.isInitialized = true;
        console.log(`页面初始化完成: ${this.currentPage}`);
        
        // 触发页面就绪事件
        this.triggerPageReady();
        
      } catch (error) {
        console.error('页面初始化失败:', error);
        this.showError('页面初始化失败，请刷新重试');
      }
    }

    // 设置页面标题
    setPageTitle() {
      const pageType = CONFIG.PAGE_TYPES[this.currentPage] || '数据分析';
      document.title = `${pageType} - 跨境电商数据分析平台`;
    }

    // 初始化站点信息
    async initSiteInfo() {
      const currentPath = window.location.pathname;
      
      if (currentPath.includes('self-operated')) {
        // 自运营页面
        this.currentSite = localStorage.getItem('currentSite') || 'ae_self_operated_a';
        this.currentSiteName = localStorage.getItem('currentSiteName') || '自运营robot站';
      } else if (currentPath.includes('independent-site')) {
        // 独立站页面
        this.currentSite = localStorage.getItem('currentIndepSite') || 'independent_poolsvacuum';
        this.currentSiteName = localStorage.getItem('currentIndepSiteName') || 'poolsvacuum.com';
      }
      
      // 更新站点显示
      this.updateSiteDisplay();
    }

    // 更新站点显示
    updateSiteDisplay() {
      const currentSiteEl = document.getElementById('currentSite');
      if (currentSiteEl && this.currentSiteName) {
        currentSiteEl.textContent = this.currentSiteName;
      }
    }

    // 初始化UI组件
    initUIComponents() {
      // 等待DOM完全准备好后再初始化组件
      this.waitForDOMReady(() => {
        // 初始化日期选择器
        this.initDatePicker();
        
        // 初始化KPI卡片
        this.initKPICards();
        
        // 初始化加载状态
        this.initLoadingStates();
      });
    }

    // 等待DOM完全准备好
    waitForDOMReady(callback) {
      if (document.readyState === 'complete') {
        callback();
      } else {
        window.addEventListener('load', callback);
      }
    }

    // 初始化日期选择器
    initDatePicker() {
      const dateFilter = document.getElementById('dateFilter');
      if (dateFilter) {
        const today = new Date();
        const end = today.toISOString().slice(0, 10);
        const start = today.getFullYear() < 2025 ? 
          CONFIG.DEFAULT_DATE_RANGE.start : 
          new Date(today.getTime() - CONFIG.DEFAULT_DATE_RANGE.days * 86400000).toISOString().slice(0, 10);
        
        dateFilter.value = `${start} to ${end}`;
        
        // 等待flatpickr加载完成
        this.waitForFlatpickr(dateFilter, start, end);
      }
    }

    // 等待flatpickr加载完成
    waitForFlatpickr(dateFilter, start, end) {
      if (typeof flatpickr !== 'undefined') {
        this.initializeFlatpickr(dateFilter, start, end);
      } else {
        // 如果flatpickr还没加载，等待一下再试
        setTimeout(() => this.waitForFlatpickr(dateFilter, start, end), 100);
      }
    }

    // 初始化flatpickr
    initializeFlatpickr(dateFilter, start, end) {
      try {
        // 保存this引用，确保在flatpickr回调中能正确访问
        const self = this;
        flatpickr(dateFilter, {
          mode: 'range',
          dateFormat: 'Y-m-d',
          defaultDate: [start, end],
          onClose: function(dates) {
            if (dates.length === 2) {
              console.log('日期选择器关闭，触发数据刷新:', dates);
              if (self && typeof self.updateStatus === 'function') {
                self.updateStatus('数据加载中...', 'loading');
              }
              if (self && typeof self.refreshData === 'function') {
                self.refreshData();
              } else {
                console.error('refreshData方法不存在或未绑定:', self);
              }
            }
          }
        });
        console.log('日期选择器初始化成功，this绑定:', this);
      } catch (error) {
        console.error('日期选择器初始化失败:', error);
      }
    }

    // 初始化KPI卡片
    initKPICards() {
      // 确保KPI卡片使用正确的样式类
      const kpiGrid = document.querySelector('.kpi-grid');
      if (kpiGrid) {
        // 移除旧的样式类
        kpiGrid.classList.remove('stats-cards', 'kpi-row');
        kpiGrid.classList.add('kpi-grid');
        
        // 确保所有KPI卡片都有正确的类
        kpiGrid.querySelectorAll('.kpi-card, .card, .stat-card').forEach(card => {
          card.classList.remove('card', 'stat-card');
          card.classList.add('kpi-card');
          
          // 根据内容设置类型
          const text = card.textContent.toLowerCase();
          if (text.includes('访客') || text.includes('点击')) {
            card.classList.add('info');
          } else if (text.includes('加购') || text.includes('商品总数')) {
            card.classList.add('success');
          } else if (text.includes('支付')) {
            card.classList.add('danger');
          } else if (text.includes('新品')) {
            card.classList.add('warning');
          }
        });
        
        console.log('KPI卡片样式初始化完成');
      } else {
        console.warn('未找到KPI网格容器');
      }
    }

    // 初始化加载状态
    initLoadingStates() {
      // 统一加载状态的样式
      document.querySelectorAll('.loading-state').forEach(loading => {
        if (!loading.querySelector('.loading-spinner')) {
          loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="loading-text">努力加载中,请等待片刻。。。</p>
          `;
        }
      });
    }

    // 更新状态显示
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

    // 初始化事件监听
    initEventListeners() {
      // 导航链接
      this.initNavigationLinks();
    }

    // 初始化导航链接
    initNavigationLinks() {
      document.querySelectorAll('.sub-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
          const target = link.dataset.target;
          const href = link.getAttribute('href');
          
          // 如果是外部链接，直接跳转
          if (href && href !== '#') {
            return; // 不阻止默认行为
          }
          
          // 如果是内部导航
          if (target) {
            e.preventDefault();
            this.switchInternalSection(target);
          }
        });
      });
    }

    // 切换内部页面部分
    switchInternalSection(target) {
      // 更新导航状态
      document.querySelectorAll('.sub-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.target === target) {
          link.classList.add('active');
        }
      });
      
      // 显示/隐藏相应的内容
      ['detail', 'analysis', 'product'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = (id === target) ? '' : 'none';
        }
      });
    }

    // 初始化数据加载
    async initDataLoading() {
      try {
        // 自运营页面有自己的数据加载逻辑，跳过基础加载
        if (this.currentPage === 'self-operated') {
          console.log('自运营页面跳过基础数据加载，使用专用逻辑');
          return;
        }
        
        await this.loadData();
      } catch (error) {
        console.error('初始数据加载失败:', error);
        this.showError('数据加载失败，请检查网络连接');
      }
    }

    // 加载数据
    async loadData() {
      // 这个方法应该由具体的页面实现
      console.log('基础数据加载方法，需要页面特定实现');
    }

    // 刷新数据
    async refreshData() {
      try {
        await this.loadData();
      } catch (error) {
        console.error('数据刷新失败:', error);
        this.showError('数据刷新失败，请重试');
      }
    }

    // 显示错误信息
    showError(message) {
      // 使用统一的错误提示
      if (typeof alert === 'function') {
        alert(message);
      } else {
        console.error(message);
      }
    }

    // 触发页面就绪事件
    triggerPageReady() {
      const event = new CustomEvent('page-ready', {
        detail: {
          pageType: this.currentPage,
          site: this.currentSite,
          siteName: this.currentSiteName
        }
      });
      document.dispatchEvent(event);
    }

    // 获取当前页面信息
    getPageInfo() {
      return {
        type: this.currentPage,
        site: this.currentSite,
        siteName: this.currentSiteName,
        isInitialized: this.isInitialized
      };
    }
  }

  // ===== 工具函数 =====
  const Utils = {
    // 安全的DOM查询
    safeQuerySelector: (selector, parent = document) => {
      try {
        return parent.querySelector(selector);
      } catch (e) {
        console.warn('DOM查询失败:', selector, e);
        return null;
      }
    },

    // 安全的属性获取
    safeGetAttribute: (element, attribute) => {
      if (!element || typeof element.getAttribute !== 'function') {
        return null;
      }
      try {
        return element.getAttribute(attribute);
      } catch (e) {
        console.warn('属性获取失败:', attribute, e);
        return null;
      }
    },

    // 格式化数字
    formatNumber: (num, decimals = 2) => {
      if (num === null || num === undefined) return '0';
      const n = Number(num);
      if (isNaN(n)) return '0';
      return n.toFixed(decimals);
    },

    // 格式化百分比
    formatPercentage: (num, decimals = 2) => {
      if (num === null || num === undefined) return '0%';
      const n = Number(num);
      if (isNaN(n)) return '0%';
      if (n <= 1) n *= 100;
      return n.toFixed(decimals) + '%';
    },

    // 安全的JSON解析
    safeJsonParse: (str, defaultValue = null) => {
      try {
        return JSON.parse(str);
      } catch (e) {
        console.warn('JSON解析失败:', str, e);
        return defaultValue;
      }
    }
  };

  // ===== 全局暴露 =====
  window.PageManager = PageManager;
  window.PageUtils = Utils;
  window.PageConfig = CONFIG;

  // ===== 自动初始化 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.pageManager = new PageManager();
    });
  } else {
    window.pageManager = new PageManager();
  }

})();
