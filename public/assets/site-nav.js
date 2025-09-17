(function () {
  const icons = {
    site: '<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20"/><path d="M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operations: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    products: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>',
    orders: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-1.5 14h-15z"/><path d="M16 9a4 4 0 0 1-8 0"/><path d="M9 13h6"/></svg>',
    advertising: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11v-4a2 2 0 0 1 2-2h2l5-3v18l-5-3H6a2 2 0 0 1-2-2v-4"/><path d="M13 14a3 3 0 0 0 3 3"/><path d="M13 8a3 3 0 0 1 3-3"/></svg>',
    inventory: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5v10l-9 5-9-5V8"/></svg>',
    permissions: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 11v2"/><path d="M12 7v.01"/></svg>'
  };

  const defaultSites = {
    ae_self_operated: [
      { id: 'ae_self_operated_a', name: '自运营robot站', display_name: '自运营robot站' },
      { id: 'ae_self_operated_poolslab_store', name: 'Poolslab运动娱乐', display_name: 'Poolslab运动娱乐' }
    ],
    independent: [
      { id: 'independent_poolsvacuum', name: 'poolsvacuum.com', display_name: 'poolsvacuum.com' },
      { id: 'independent_icyberite', name: 'icyberite.com', display_name: 'icyberite.com' }
    ]
  };

  const platformContext = {
    'self-operated': {
      platform: 'ae_self_operated',
      storageKey: 'currentSite',
      storageNameKey: 'currentSiteName',
      defaultSite: 'ae_self_operated_a',
      defaultSiteName: '自运营robot站'
    },
    'independent-site': {
      platform: 'independent',
      storageKey: 'currentIndepSite',
      storageNameKey: 'currentIndepSiteName',
      defaultSite: 'independent_poolsvacuum',
      defaultSiteName: 'poolsvacuum.com'
    },
    managed: {
      platform: 'ae_managed'
    },
    amazon: {
      platform: 'amazon'
    },
    tiktok: {
      platform: 'tiktok'
    },
    temu: {
      platform: 'temu'
    },
    ozon: {
      platform: 'ozon'
    }
  };

  let originalSidebarMarkup = null;
  let styleInjected = false;

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .sidebar .sub-nav li.disabled > a,
      .sidebar .global-modules li.disabled > a {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .sidebar .sub-nav li.disabled > a:hover,
      .sidebar .global-modules li.disabled > a:hover {
        background: rgba(148, 163, 184, 0.1);
      }
      .sidebar .global-modules {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(148, 163, 184, 0.25);
      }
      .sidebar .global-modules h4 {
        margin: 0 0 .5rem 0;
        font-size: 12px;
        letter-spacing: 0.05em;
        color: #94a3b8;
        text-transform: uppercase;
      }
      .sidebar .global-modules ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .sidebar .global-modules li {
        margin: .25rem 0;
      }
      .sidebar .global-modules li a {
        display: flex;
        align-items: center;
        gap: .5rem;
        padding: .4rem .75rem;
        border-radius: .5rem;
        color: inherit;
        text-decoration: none;
      }
      .sidebar .global-modules li a:hover {
        background: rgba(59, 130, 246, 0.1);
      }
      .sidebar .sub-nav .loading {
        padding: .5rem .75rem;
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  function getCurrentUserRole() {
    const stored = localStorage.getItem('currentUserRole');
    return stored ? stored.toLowerCase() : 'viewer';
  }

  function detectPageType() {
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

  function resolveContext() {
    const info = window.pageManager && typeof window.pageManager.getPageInfo === 'function'
      ? window.pageManager.getPageInfo()
      : null;
    const pageType = info?.type && info.type !== 'unknown' ? info.type : detectPageType();
    const config = platformContext[pageType] || {};

    let siteId = info?.site || null;
    let siteName = info?.siteName || null;

    if (!siteId && config.storageKey) {
      siteId = localStorage.getItem(config.storageKey) || null;
    }
    if (!siteName && config.storageNameKey) {
      siteName = localStorage.getItem(config.storageNameKey) || null;
    }
    if (!siteId && config.defaultSite) {
      siteId = typeof config.defaultSite === 'function' ? config.defaultSite() : config.defaultSite;
    }
    if (!siteName && config.defaultSiteName) {
      siteName = config.defaultSiteName;
    }

    return {
      pageType,
      platform: config.platform || null,
      siteId,
      siteName,
      includeGlobal: config.includeGlobal !== false,
      navSelector: config.navSelector || '.sub-nav'
    };
  }

  function ensureGlobalSection(sidebar) {
    if (!sidebar) return null;
    injectStyles();
    let wrapper = sidebar.querySelector('.global-modules');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'global-modules';
      const heading = document.createElement('h4');
      heading.textContent = '全局设置';
      const list = document.createElement('ul');
      wrapper.appendChild(heading);
      wrapper.appendChild(list);
      sidebar.appendChild(wrapper);
    }
    const list = wrapper.querySelector('ul');
    list.innerHTML = '';
    return { wrapper, list };
  }

  function decorateSiteHeader() {
    const header = document.querySelector('.sidebar .site-header');
    if (header && !header.querySelector('svg')) {
      header.insertAdjacentHTML('afterbegin', icons.site);
    }
  }

  function renderSiteMenus() {
    const managedMenu = document.getElementById('managedMenu');
    const indepMenu = document.getElementById('indepMenu');

    if (managedMenu) {
      managedMenu.innerHTML = '';
      const currentSite = localStorage.getItem('currentSite');
      (defaultSites.ae_self_operated || []).forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'self-operated.html';
        a.textContent = site.display_name;
        if (site.id === currentSite) {
          li.className = 'active';
        }
        a.addEventListener('click', event => {
          event.preventDefault();
          localStorage.setItem('currentSite', site.id);
          localStorage.setItem('currentSiteName', site.display_name);
          window.location.href = 'self-operated.html';
        });
        li.appendChild(a);
        managedMenu.appendChild(li);
      });

      const managedLi = document.createElement('li');
      const managedA = document.createElement('a');
      managedA.href = 'managed.html';
      managedA.textContent = '全托管';
      managedA.addEventListener('click', event => {
        event.preventDefault();
        localStorage.removeItem('currentSite');
        localStorage.removeItem('currentSiteName');
        window.location.href = 'managed.html';
      });
      managedLi.appendChild(managedA);
      managedMenu.appendChild(managedLi);
    }

    if (indepMenu) {
      indepMenu.innerHTML = '';
      const currentIndepSite = localStorage.getItem('currentIndepSite');
      (defaultSites.independent || []).forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'independent-site.html';
        a.textContent = site.display_name;
        if (site.id === currentIndepSite) {
          li.className = 'active';
        }
        a.addEventListener('click', event => {
          event.preventDefault();
          localStorage.setItem('currentIndepSite', site.id);
          localStorage.setItem('currentIndepSiteName', site.display_name);
          window.location.href = `independent-site.html?site=${encodeURIComponent(site.name)}`;
        });
        li.appendChild(a);
        indepMenu.appendChild(li);
      });
    }
  }

  function updateCurrentSiteDisplay(context) {
    const currentSiteEl = document.getElementById('currentSite');
    const currentManagedSiteEl = document.getElementById('currentManagedSite');
    if (currentManagedSiteEl) {
      return;
    }
    if (!currentSiteEl) return;

    if (context.siteName) {
      currentSiteEl.textContent = context.siteName;
      return;
    }

    if (!context.siteId) {
      currentSiteEl.textContent = '自运营';
      return;
    }

    const selfMap = {
      ae_self_operated_a: '自运营robot站',
      ae_self_operated_poolslab_store: 'Poolslab运动娱乐'
    };
    const indepMap = {
      independent_poolsvacuum: 'poolsvacuum.com',
      independent_icyberite: 'icyberite.com'
    };
    currentSiteEl.textContent = selfMap[context.siteId] || indepMap[context.siteId] || context.siteId;
  }

  function setupDropdownEvents() {
    const platformNavItems = document.querySelectorAll('.platform-nav > li');
    platformNavItems.forEach(item => {
      const dropdown = item.querySelector('.dropdown');
      if (!dropdown) return;
      item.addEventListener('mouseenter', () => {
        dropdown.style.display = 'block';
      });
      item.addEventListener('mouseleave', () => {
        dropdown.style.display = 'none';
      });
      item.addEventListener('click', event => {
        if (event.target.tagName === 'A') {
          return;
        }
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      });
    });

    document.querySelectorAll('.platform-nav a[href]').forEach(link => {
      link.addEventListener('click', event => {
        const currentPath = window.location.pathname;
        if (currentPath.includes('self-operated') && typeof window.handlePlatformSwitch === 'function') {
          try {
            event.preventDefault();
            const platform = link.getAttribute('data-platform') || link.textContent.trim();
            window.handlePlatformSwitch(platform);
            return;
          } catch (err) {
            console.warn('Platform switch handler failed:', err);
          }
        }
      }, { passive: false });
    });
  }

  function buildNavEntries(module, context) {
    const baseOrder = typeof module.navOrder === 'number' ? module.navOrder : 0;
    const disabled = module.enabled === false || module.visibleRoles === null;
    const missingData = module.hasDataSource === false;
    const entries = [];

    switch (module.moduleKey) {
      case 'operations':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.config?.detailLabel || '详细数据',
          target: 'detail',
          href: '#detail',
          icon: 'detail',
          order: baseOrder - 0.5,
          disabled: disabled,
          global: module.isGlobal
        });
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '运营分析',
          target: 'analysis',
          href: '#analysis',
          icon: 'operations',
          order: baseOrder,
          disabled: disabled,
          global: module.isGlobal
        });
        break;
      case 'products':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '产品分析',
          target: 'products',
          href: '#products',
          icon: 'products',
          order: baseOrder,
          disabled: disabled,
          global: module.isGlobal
        });
        break;
      case 'orders':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '订单中心',
          href: module.config?.entryPath || '#',
          icon: 'orders',
          order: baseOrder,
          disabled: disabled || missingData,
          global: module.isGlobal,
          message: module.config?.emptyMessage || '订单中心即将开放，敬请期待'
        });
        break;
      case 'advertising':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '广告中心',
          href: module.config?.entryPath || '#',
          icon: 'advertising',
          order: baseOrder,
          disabled: disabled || missingData,
          global: module.isGlobal,
          message: module.config?.emptyMessage || '广告中心暂未接入当前站点'
        });
        break;
      case 'inventory':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '库存管理',
          href: module.config?.entryPath || 'site-management.html#inventory',
          icon: 'inventory',
          order: baseOrder,
          disabled: disabled || missingData,
          global: true,
          message: module.config?.emptyMessage || '库存模块需具备相应权限'
        });
        break;
      case 'permissions':
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || '权限管理',
          href: module.config?.entryPath || 'site-management.html#permissions',
          icon: 'permissions',
          order: baseOrder,
          disabled: disabled,
          global: true,
          message: module.config?.emptyMessage || '权限管理仅对超级管理员开放'
        });
        break;
      default:
        entries.push({
          moduleKey: module.moduleKey,
          label: module.navLabel || module.moduleKey,
          href: module.config?.entryPath || '#',
          icon: 'operations',
          order: baseOrder,
          disabled: disabled,
          global: module.isGlobal
        });
        break;
    }

    return entries;
  }

  function renderSidebarModules(modules, context, role) {
    const navList = document.querySelector(context.navSelector || '.sub-nav');
    if (!navList) return;
    const sidebar = navList.closest('.sidebar');
    const globalSection = ensureGlobalSection(sidebar);

    if (originalSidebarMarkup === null) {
      originalSidebarMarkup = navList.innerHTML;
    }

    navList.innerHTML = '';
    if (globalSection) {
      globalSection.list.innerHTML = '';
    }

    let firstActiveSet = false;
    const entries = [];
    modules.forEach(module => {
      buildNavEntries(module, context).forEach(entry => {
        entries.push({ entry, module });
      });
    });

    entries.sort((a, b) => a.entry.order - b.entry.order);

    entries.forEach(({ entry, module }) => {
      const targetList = entry.global && globalSection ? globalSection.list : navList;
      if (!targetList) return;
      const li = document.createElement('li');
      if (entry.disabled) {
        li.classList.add('disabled');
      }
      const a = document.createElement('a');
      a.textContent = entry.label;
      if (entry.target) {
        a.dataset.target = entry.target;
        a.href = entry.href || `#${entry.target}`;
      } else {
        a.href = entry.href || '#';
      }
      if (entry.icon && icons[entry.icon]) {
        a.insertAdjacentHTML('afterbegin', icons[entry.icon]);
      }
      if (entry.disabled) {
        a.setAttribute('aria-disabled', 'true');
        a.addEventListener('click', event => {
          event.preventDefault();
          if (entry.message) {
            alert(entry.message);
          }
        });
      }
      if (!entry.global && !entry.disabled && !firstActiveSet) {
        li.classList.add('active');
        firstActiveSet = true;
      }
      li.appendChild(a);
      targetList.appendChild(li);
    });

    if (globalSection && !globalSection.list.childElementCount) {
      globalSection.wrapper.remove();
    }

    if (window.pageManager && typeof window.pageManager.initNavigationLinks === 'function') {
      window.pageManager.initNavigationLinks();
    }
  }

  async function loadSidebarModules() {
    const context = resolveContext();
    const role = getCurrentUserRole();
    const navList = document.querySelector(context.navSelector || '.sub-nav');
    if (!navList) return;

    if (originalSidebarMarkup === null) {
      originalSidebarMarkup = navList.innerHTML;
    }

    navList.innerHTML = '<li class="loading">模块加载中...</li>';

    const params = new URLSearchParams();
    params.set('includeGlobal', context.includeGlobal ? 'true' : 'false');
    if (!context.siteId && context.platform) {
      params.set('platform', context.platform);
    }

    const endpoint = context.siteId
      ? `/api/site-modules/${encodeURIComponent(context.siteId)}?${params.toString()}`
      : `/api/site-modules?${params.toString()}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          'X-User-Role': role
        }
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `Request failed with status ${response.status}`);
      }
      const modules = Array.isArray(payload.data?.modules) ? payload.data.modules : [];
      renderSidebarModules(modules, context, role);
    } catch (error) {
      console.error('Failed to load sidebar modules:', error);
      if (originalSidebarMarkup !== null) {
        navList.innerHTML = originalSidebarMarkup;
        if (window.pageManager && typeof window.pageManager.initNavigationLinks === 'function') {
          window.pageManager.initNavigationLinks();
        }
      }
    }
  }

  function initialize() {
    injectStyles();
    const context = resolveContext();
    renderSiteMenus();
    decorateSiteHeader();
    updateCurrentSiteDisplay(context);
    setupDropdownEvents();
    loadSidebarModules();
  }

  document.addEventListener('page-ready', () => {
    const context = resolveContext();
    updateCurrentSiteDisplay(context);
    loadSidebarModules();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
