// Handles shared site menus and injects default sidebar icons
(function(){
  const icons={
    site:'<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operation:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    product:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>',
    orders:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l1 4H5l1-4z"/><path d="M5 7h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7z"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>',
    advertising:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v13H5l-1 3z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>'
  };

  // 默认站点配置
  const defaultSites = {
      ae_self_operated: [
        { id: 'ae_self_operated_a', name: '自运营robot站', display_name: '自运营robot站', platform: 'ae_self_operated' },
        { id: 'ae_self_operated_poolslab_store', name: 'poolslab', display_name: 'Poolslab运动娱乐', platform: 'ae_self_operated' },
      ],
    independent: [
      { id: 'independent_poolsvacuum', name: 'poolsvacuum', display_name: 'poolsvacuum.com', platform: 'independent' },
      { id: 'independent_icyberite', name: 'icyberite', display_name: 'icyberite.com', platform: 'independent' }
    ]
  };

  const PLATFORM_LABELS = {
    ae_self_operated: '速卖通',
    ae_managed: '速卖通全托管',
    independent: '独立站',
    amazon: '亚马逊',
    ozon: 'Ozon',
    tiktok: 'TikTok Shop',
    temu: 'Temu',
    lazada: 'Lazada',
    shopee: 'Shopee'
  };

  const PLATFORM_PAGE_MAP = {
    ae_self_operated: 'self-operated.html',
    ae_managed: 'managed.html',
    independent: 'independent-site.html',
    amazon: 'amazon-overview.html',
    ozon: 'ozon-detail.html',
    tiktok: 'tiktok.html',
    temu: 'temu.html'
  };

  let siteConfigCache = [];
  
  // 站点名称映射函数
  function getSiteDisplayName(siteId, platform) {
    if (!siteId) return '';

    const cached = siteConfigCache.find((site) => site && site.id === siteId);
    if (cached) {
      return cached.display_name || cached.name || siteId;
    }

    const fallbackList = platform && defaultSites[platform];
    if (Array.isArray(fallbackList)) {
      const fallback = fallbackList.find((site) => site.id === siteId);
      if (fallback) {
        return fallback.display_name || fallback.name || siteId;
      }
    }

    return siteId;
  }

  function normalizeSiteRecord(site) {
    if (!site) return null;
    const id = site.id || site.site_id || site.name;
    if (!id) return null;
    const platform = (site.platform || site.platform_id || '').toString().toLowerCase();
    const displayName = site.display_name || site.name || site.title || id;
    const name = site.name || displayName;
    return {
      id,
      platform,
      display_name: displayName,
      name,
      raw: site,
    };
  }

  function getDefaultNormalizedSites() {
    const list = [];
    Object.values(defaultSites).forEach((sites) => {
      if (!Array.isArray(sites)) return;
      sites.forEach((site) => {
        const normalized = normalizeSiteRecord(site);
        if (normalized) {
          list.push(normalized);
        }
      });
    });
    return list;
  }

  function groupSitesByPlatform(sites) {
    const grouped = {};
    (sites || []).forEach((site) => {
      if (!site) return;
      const platform = site.platform || 'unassigned';
      if (!grouped[platform]) {
        grouped[platform] = [];
      }
      grouped[platform].push(site);
    });
    return grouped;
  }

  function getPlatformLabel(platform) {
    return PLATFORM_LABELS[platform] || platform || '未命名平台';
  }

  function buildSiteUrl(basePage, site) {
    if (!basePage) return '#';
    if (!site) return basePage;
    if (basePage === 'self-operated.html') return basePage;

    const params = new URLSearchParams();
    if (basePage === 'independent-site.html') {
      params.set('site', site.name || site.display_name || site.id);
    }
    params.set('siteId', site.id);
    if (site.platform) {
      params.set('platform', site.platform);
    }
    const query = params.toString();
    return query ? `${basePage}?${query}` : basePage;
  }

  function getDefaultPlatformHref(platform, sites) {
    const base = PLATFORM_PAGE_MAP[platform] || 'site-dashboard.html';
    const normalizedSites = Array.isArray(sites) ? sites : [];
    if (!normalizedSites.length) {
      return base;
    }
    return buildSiteUrl(base, normalizedSites[0]);
  }

  function handleSiteNavigation(site) {
    if (!site) return;
    const platform = site.platform || '';
    const displayName = site.display_name || site.name || site.id;

    localStorage.setItem('activeSiteId', site.id);
    localStorage.setItem('activeSitePlatform', platform);
    localStorage.setItem('activeSiteName', displayName);

    if (platform === 'ae_self_operated') {
      localStorage.setItem('currentSite', site.id);
      localStorage.setItem('currentSiteName', displayName);
      window.location.href = 'self-operated.html';
      return;
    }

    if (platform === 'independent') {
      localStorage.setItem('currentIndepSite', site.id);
      localStorage.setItem('currentIndepSiteName', displayName);
      window.location.href = buildSiteUrl('independent-site.html', site);
      return;
    }

    const basePage = PLATFORM_PAGE_MAP[platform] || 'site-dashboard.html';
    window.location.href = buildSiteUrl(basePage, site);
  }

  function createDropdownItem(site) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const displayName = site.display_name || site.name || site.id;
    a.href = '#';
    a.dataset.siteId = site.id;
    a.dataset.platform = site.platform || '';
    a.textContent = displayName;
    a.addEventListener('click', (event) => {
      event.preventDefault();
      handleSiteNavigation(site);
    });
    li.appendChild(a);
    return li;
  }

  function renderSelfOperatedMenu(sites) {
    const managedMenu = document.getElementById('managedMenu');
    if (!managedMenu) return;

    managedMenu.innerHTML = '';
    const currentSite = localStorage.getItem('currentSite');
    const normalizedSites = (sites && sites.length ? sites : defaultSites.ae_self_operated || [])
      .map(normalizeSiteRecord)
      .filter(Boolean)
      .sort((a, b) => (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'zh-CN'));

    normalizedSites.forEach((site) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const displayName = site.display_name || site.name || site.id;
      a.href = '#';
      a.dataset.siteId = site.id;
      a.dataset.platform = site.platform || 'ae_self_operated';
      a.textContent = displayName;

      if (site.id === currentSite) {
        li.className = 'active';
        a.style.background = 'var(--brand)';
        a.style.color = '#fff';
      }

      a.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('currentSite', site.id);
        localStorage.setItem('currentSiteName', displayName);
        localStorage.setItem('activeSiteId', site.id);
        localStorage.setItem('activeSitePlatform', site.platform || 'ae_self_operated');
        localStorage.setItem('activeSiteName', displayName);
        window.location.href = 'self-operated.html';
      });

      li.appendChild(a);
      managedMenu.appendChild(li);
    });

    const managedLi = document.createElement('li');
    const managedA = document.createElement('a');
    managedA.href = 'managed.html';
    managedA.textContent = '全托管';
    managedA.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('currentSite');
      localStorage.removeItem('currentSiteName');
      localStorage.setItem('activeSitePlatform', 'ae_managed');
      localStorage.setItem('activeSiteName', '速卖通全托管');
      window.location.href = 'managed.html';
    });
    managedLi.appendChild(managedA);
    managedMenu.appendChild(managedLi);
  }

  function renderIndependentMenu(sites) {
    const indepMenu = document.getElementById('indepMenu');
    if (!indepMenu) return;

    indepMenu.innerHTML = '';
    const currentIndepSite = localStorage.getItem('currentIndepSite');
    const normalizedSites = (sites && sites.length ? sites : defaultSites.independent || [])
      .map(normalizeSiteRecord)
      .filter(Boolean)
      .sort((a, b) => (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'zh-CN'));

    normalizedSites.forEach((site) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const displayName = site.display_name || site.name || site.id;
      a.href = '#';
      a.dataset.siteId = site.id;
      a.dataset.platform = site.platform || 'independent';
      a.textContent = displayName;

      if (site.id === currentIndepSite) {
        li.className = 'active';
        a.style.background = 'var(--brand)';
        a.style.color = '#fff';
      }

      a.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.setItem('currentIndepSite', site.id);
        localStorage.setItem('currentIndepSiteName', displayName);
        localStorage.setItem('activeSiteId', site.id);
        localStorage.setItem('activeSitePlatform', site.platform || 'independent');
        localStorage.setItem('activeSiteName', displayName);
        window.location.href = buildSiteUrl('independent-site.html', site);
      });

      li.appendChild(a);
      indepMenu.appendChild(li);
    });
  }

  function renderPlatformDropdown(platform, sites) {
    const nav = document.querySelector('.platform-nav');
    if (!nav) return;

    const hasSites = Array.isArray(sites) && sites.length > 0;
    let entry = nav.querySelector(`li[data-platform="${platform}"]`);
    if (!entry) {
      entry = nav.querySelector(`li.${platform}`);
    }

    if (!hasSites) {
      if (entry && entry.dataset.autoPlatform === 'true') {
        entry.remove();
      }
      return;
    }

    if (!entry) {
      entry = document.createElement('li');
      entry.dataset.platform = platform;
      entry.dataset.autoPlatform = 'true';
      entry.classList.add(platform);
      const anchor = document.createElement('a');
      anchor.href = '#';
      anchor.textContent = getPlatformLabel(platform);
      entry.appendChild(anchor);
      nav.appendChild(entry);
    } else {
      entry.dataset.platform = platform;
    }

    let dropdown = entry.querySelector('.dropdown');
    if (!dropdown) {
      dropdown = document.createElement('ul');
      dropdown.className = 'dropdown';
      entry.appendChild(dropdown);
    }
    dropdown.innerHTML = '';

    const normalized = sites
      .map(normalizeSiteRecord)
      .filter(Boolean)
      .sort((a, b) => (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', 'zh-CN'));

    normalized.forEach((site) => {
      dropdown.appendChild(createDropdownItem(site));
    });

    const anchor = entry.querySelector('a');
    if (anchor) {
      anchor.textContent = getPlatformLabel(platform);
      const href = getDefaultPlatformHref(platform, normalized);
      anchor.href = href || '#';
    }
  }

  function highlightActiveSite() {
    const activeSiteId = localStorage.getItem('activeSiteId');
    if (!activeSiteId) return;
    document.querySelectorAll('.platform-nav .dropdown li').forEach((item) => {
      const link = item.querySelector('a[data-site-id]');
      if (!link) return;
      if (link.dataset.siteId === activeSiteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  async function loadSiteConfigs() {
    const fallback = getDefaultNormalizedSites();
    try {
      const response = await fetch('/api/site-configs');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const normalized = Array.isArray(payload?.data)
        ? payload.data.map(normalizeSiteRecord).filter(Boolean)
        : [];
      const knownIds = new Set(normalized.map((site) => site.id));
      fallback.forEach((site) => {
        if (site && !knownIds.has(site.id)) {
          normalized.push(site);
        }
      });
      siteConfigCache = normalized;
      return normalized;
    } catch (error) {
      console.warn('加载站点配置失败，将回退到默认站点', error);
      siteConfigCache = fallback;
      return fallback;
    }
  }

  async function renderSiteMenus() {
    console.log('开始渲染站点菜单...');
    const sites = await loadSiteConfigs();
    const grouped = groupSitesByPlatform(sites);

    renderSelfOperatedMenu(grouped.ae_self_operated || []);
    renderIndependentMenu(grouped.independent || []);

    Object.entries(grouped).forEach(([platform, platformSites]) => {
      if (platform === 'ae_self_operated' || platform === 'independent') return;
      renderPlatformDropdown(platform, platformSites);
    });

    highlightActiveSite();
    updateCurrentSiteDisplay();
    setupDropdownEvents();
    console.log('站点菜单渲染完成');
  }

  function applyNavIcons(){
    // 只处理侧边栏的图标，不处理站点选择器
    document.querySelectorAll('.sidebar .site-title').forEach(title=>{
      if(!title.querySelector('svg')){
        title.insertAdjacentHTML('afterbegin',icons.site);
      }
    });
    document.querySelectorAll('.sidebar .sub-nav>li>a').forEach(a=>{
      if(a.querySelector('svg')) return;
      const txt=a.textContent.trim();
      if(/明细|数据/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.detail);
      else if(/运营/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.operation);
      else if(/产品/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.product);
      else if(/订单/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.orders);
      else if(/广告/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.advertising);
    });
  }

  // 更新当前站点显示
  function updateCurrentSiteDisplay() {
    const currentSiteEl = document.getElementById('currentSite');
    const currentManagedSiteEl = document.getElementById('currentManagedSite');

    if (currentManagedSiteEl) {
      console.log('全托管页面，跳过站点名更新');
      return;
    }

    if (!currentSiteEl) return;

    const currentPath = window.location.pathname;
    const isIndependentPage = currentPath.includes('independent-site');
    const isSelfOperatedPage = currentPath.includes('self-operated');

    const activeSiteId = localStorage.getItem('activeSiteId');
    const activeSiteName = localStorage.getItem('activeSiteName');
    const activeSitePlatform = localStorage.getItem('activeSitePlatform');

    if (isIndependentPage) {
      const currentIndepSiteId = localStorage.getItem('currentIndepSite') || activeSiteId;
      const currentIndepSiteName = localStorage.getItem('currentIndepSiteName') || activeSiteName;

      if (currentIndepSiteName) {
        currentSiteEl.textContent = currentIndepSiteName;
      } else if (currentIndepSiteId) {
        const displayName = getSiteDisplayName(currentIndepSiteId, 'independent');
        const resolved = displayName || currentIndepSiteId;
        currentSiteEl.textContent = resolved;
        localStorage.setItem('currentIndepSite', currentIndepSiteId);
        localStorage.setItem('currentIndepSiteName', resolved);
        localStorage.setItem('activeSiteId', currentIndepSiteId);
        localStorage.setItem('activeSitePlatform', 'independent');
        localStorage.setItem('activeSiteName', resolved);
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        const siteParam = urlParams.get('site');
        if (siteParam) {
          currentSiteEl.textContent = siteParam;
          localStorage.setItem('activeSiteName', siteParam);
        } else {
          currentSiteEl.textContent = '独立站';
        }
      }

      console.log('独立站页面更新站点显示:', currentSiteEl.textContent);
      return;
    }

    if (isSelfOperatedPage) {
      const currentSiteId = localStorage.getItem('currentSite') || activeSiteId || 'ae_self_operated_a';
      let currentSiteName = localStorage.getItem('currentSiteName') || activeSiteName;

      if (!currentSiteName && currentSiteId) {
        currentSiteName = getSiteDisplayName(currentSiteId, 'ae_self_operated');
        localStorage.setItem('currentSiteName', currentSiteName);
      }

      currentSiteEl.textContent = currentSiteName || '自运营';
      localStorage.setItem('currentSite', currentSiteId);
      localStorage.setItem('activeSiteId', currentSiteId);
      localStorage.setItem('activeSitePlatform', 'ae_self_operated');
      localStorage.setItem('activeSiteName', currentSiteName || '自运营');
      console.log('自运营页面更新站点显示:', currentSiteEl.textContent);
      return;
    }

    if (activeSiteName) {
      currentSiteEl.textContent = activeSiteName;
      console.log('其他页面使用激活站点显示:', activeSiteName);
      return;
    }

    if (activeSiteId) {
      const resolvedName = getSiteDisplayName(activeSiteId, activeSitePlatform);
      currentSiteEl.textContent = resolvedName || activeSiteId;
      if (resolvedName) {
        localStorage.setItem('activeSiteName', resolvedName);
      }
      console.log('其他页面根据站点ID映射显示:', currentSiteEl.textContent);
      return;
    }

    const fallbackSiteId = localStorage.getItem('currentSite');
    const fallbackSiteName = localStorage.getItem('currentSiteName');
    if (fallbackSiteId && fallbackSiteName) {
      currentSiteEl.textContent = fallbackSiteName;
      console.log('其他页面使用自运营站点显示:', fallbackSiteName);
      return;
    }

    const fallbackIndepName = localStorage.getItem('currentIndepSiteName');
    if (fallbackIndepName) {
      currentSiteEl.textContent = fallbackIndepName;
      console.log('其他页面使用独立站站点显示:', fallbackIndepName);
      return;
    }

    currentSiteEl.textContent = '自运营';
    console.log('其他页面使用默认名称: 自运营');
  }

  // 设置下拉菜单事件
  function setupDropdownEvents() {
    const platformNavItems = document.querySelectorAll('.platform-nav > li');

    platformNavItems.forEach(item => {
      if (item.dataset.dropdownBound === 'true') return;
      const dropdown = item.querySelector('.dropdown');
      if (!dropdown) return;

      // 鼠标进入显示菜单
      item.addEventListener('mouseenter', () => {
        dropdown.style.display = 'block';
      });

      // 鼠标离开隐藏菜单
      item.addEventListener('mouseleave', () => {
        dropdown.style.display = 'none';
      });

      // 点击菜单项时保持菜单显示（用于移动设备）
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
          return;
        }
        if (dropdown.style.display === 'block') {
          dropdown.style.display = 'none';
        } else {
          dropdown.style.display = 'block';
        }
      });

      item.dataset.dropdownBound = 'true';
    });

    // 确保所有导航链接都能正常工作
    const allNavLinks = document.querySelectorAll('.platform-nav a[href]');
    allNavLinks.forEach(link => {
      if (link.dataset.navBound === 'true') return;
      link.addEventListener('click', (e) => {
        console.log('导航链接点击:', link.href);

        const currentPath = window.location.pathname;
        if (currentPath.includes('self-operated')) {
          if (window.handlePlatformSwitch && link && link.getAttribute) {
            try {
              e.preventDefault();
              const platform = link.getAttribute('data-platform') || link.textContent.trim();
              console.log('自运营页面平台切换:', platform);
              window.handlePlatformSwitch(platform);
              return;
            } catch (error) {
              console.warn('平台切换处理出错:', error);
            }
          }
        }
      });
      link.dataset.navBound = 'true';
    });

    console.log('下拉菜单事件处理已设置');
  }

  // 全局错误处理函数
  function safeGetAttribute(element, attribute, fallback = '') {
    try {
      if (element && typeof element.getAttribute === 'function') {
        return element.getAttribute(attribute) || fallback;
      }
      return fallback;
    } catch (error) {
      console.warn('safeGetAttribute 出错:', error, { element, attribute });
      return fallback;
    }
  }

  // 初始化函数
  async function initialize() {
    console.log('开始初始化站点菜单...');

    try {
      await renderSiteMenus();
      applyNavIcons();
      ensureAdminLink();
      setupDropdownEvents();

      console.log('站点菜单初始化完成');
    } catch (error) {
      console.error('站点菜单初始化失败:', error);
    }
  }

  // 全局函数，供其他页面调用
  window.renderSiteMenus = renderSiteMenus;
  window.refreshSiteMenus = renderSiteMenus;
  window.updateCurrentSiteDisplay = updateCurrentSiteDisplay;

  function ensureAdminLink() {
    const platformNav = document.querySelector('.platform-nav');
    if (!platformNav) return;

    const existing = platformNav.querySelector('a[href="admin.html"]');
    if (existing) {
      existing.setAttribute('title', '站点与权限统一管理后台');
      return;
    }

    const adminItem = document.createElement('li');
    adminItem.className = 'admin';

    const adminLink = document.createElement('a');
    adminLink.href = 'admin.html';
    adminLink.textContent = '管理后台';
    adminLink.title = '站点配置、权限矩阵与全局设置入口';

    adminItem.appendChild(adminLink);
    platformNav.appendChild(adminItem);
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
