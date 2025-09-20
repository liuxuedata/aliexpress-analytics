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
      {
        id: 'ae_self_operated_a',
        name: '自运营robot站',
        display_name: '自运营robot站',
        platform: 'ae_self_operated'
      },
      {
        id: 'ae_self_operated_poolslab_store',
        name: 'poolslab',
        display_name: 'Poolslab运动娱乐',
        platform: 'ae_self_operated'
      }
    ],
    independent: [
      {
        id: 'independent_poolsvacuum',
        name: 'poolsvacuum',
        display_name: 'poolsvacuum.com',
        platform: 'independent'
      },
      {
        id: 'independent_icyberite',
        name: 'icyberite',
        display_name: 'icyberite.com',
        platform: 'independent'
      }
    ]
  };

  const DYNAMIC_PLATFORM_INFO = {
    lazada: {
      label: 'Lazada',
      href: 'lazada.html',
      className: 'lazada',
      insertBefore: '.independent',
      optional: true
    },
    shopee: {
      label: 'Shopee',
      href: 'shopee.html',
      className: 'shopee',
      insertBefore: '.independent',
      optional: true
    }
  };

  let siteConfigsCache = null;
  let siteConfigsPromise = null;

  function normalizeSiteConfig(site) {
    if (!site) return null;
    const id = site.id || `${site.platform || 'site'}_${site.name || Date.now()}`;
    const displayName = site.display_name || site.name || site.domain || id;
    return {
      id,
      name: site.name || id,
      display_name: displayName,
      platform: site.platform || null
    };
  }

  function mergeSiteEntries(baseList = [], configList = []) {
    const mergedMap = new Map();

    function addToMap(site) {
      const normalized = normalizeSiteConfig(site);
      if (!normalized) return;

      const combined = { ...site, ...normalized };
      const idKey = (combined.id || combined.name || combined.display_name || '').trim().toLowerCase();
      const platformKey = (combined.platform || '').trim().toLowerCase();
      if (!idKey && !platformKey) return;

      const compositeKey = `${platformKey}|${idKey}`;
      if (mergedMap.has(compositeKey)) {
        const existing = mergedMap.get(compositeKey);
        mergedMap.set(compositeKey, { ...existing, ...combined });
      } else {
        mergedMap.set(compositeKey, combined);
      }
    }

    baseList.forEach(addToMap);
    configList.forEach(addToMap);

    return Array.from(mergedMap.values());
  }

  function dedupeSitesByLabel(sites = [], platform) {
    const seen = new Set();
    return sites.filter(site => {
      if (!site) return false;
      const name = site.display_name || site.name || site.id || '';
      const key = `${platform || site.platform || ''}|${name.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function getSiteConfigs(forceReload = false) {
    if (!forceReload && Array.isArray(siteConfigsCache)) {
      return siteConfigsCache;
    }

    if (forceReload || !siteConfigsPromise) {
      siteConfigsPromise = fetch('/api/site-configs')
        .then(async res => {
          if (!res.ok) throw new Error(`Failed to load site configs: ${res.status}`);
          const payload = await res.json();
          return Array.isArray(payload?.data) ? payload.data : [];
        })
        .catch(err => {
          console.warn('加载站点配置失败，将回退到默认站点。', err);
          return [];
        })
        .finally(() => {
          siteConfigsPromise = null;
        });
    }

    siteConfigsCache = await siteConfigsPromise;
    return siteConfigsCache;
  }

  function getPlatformSiteSelection(platform, fallback = {}) {
    if (!platform) return null;
    const storedId = localStorage.getItem(`currentSiteId:${platform}`);
    const storedName = localStorage.getItem(`currentSiteName:${platform}`);

    if (storedId || storedName) {
      const resolvedId = storedId || fallback.id || null;
      const resolvedName = storedName || fallback.name || fallback.display_name || resolvedId;
      if (!resolvedId && !resolvedName) return null;
      return { id: resolvedId, name: resolvedName || resolvedId || null };
    }

    const platformSites = Array.isArray(siteConfigsCache)
      ? siteConfigsCache
          .filter(site => site?.platform === platform)
          .map(normalizeSiteConfig)
          .filter(Boolean)
      : [];

    if (platformSites.length) {
      const first = platformSites[0];
      const id = first.id;
      const name = first.display_name || first.name || id;
      if (id) {
        localStorage.setItem(`currentSiteId:${platform}`, id);
      }
      if (name) {
        localStorage.setItem(`currentSiteName:${platform}`, name);
      }
      return { id, name: name || id || null };
    }

    if (!fallback.id && !fallback.name && !fallback.display_name) {
      return null;
    }

    const fallbackId = fallback.id || null;
    const fallbackName = fallback.name || fallback.display_name || fallbackId;
    if (!fallbackId && !fallbackName) return null;
    return { id: fallbackId, name: fallbackName || fallbackId || null };
  }

  function notifyPlatformSelection(platform) {
    if (!platform) return;
    const selection = getPlatformSiteSelection(platform) || {};
    document.dispatchEvent(new CustomEvent('site-selection-changed', {
      detail: { platform, selection }
    }));
  }

  function storePlatformSelection(platform, site) {
    if (!platform || !site) return;
    const id = site.id || site.name || site.display_name;
    const displayName = site.display_name || site.name || site.domain || id;
    if (id) {
      localStorage.setItem(`currentSiteId:${platform}`, id);
    }
    if (displayName) {
      localStorage.setItem(`currentSiteName:${platform}`, displayName);
    }
    notifyPlatformSelection(platform);
  }

  function ensureSiteDefaults(platform, sites) {
    if (!platform || !Array.isArray(sites) || !sites.length) return;
    const storedId = localStorage.getItem(`currentSiteId:${platform}`);
    if (!storedId) {
      storePlatformSelection(platform, sites[0]);
    }
  }

  function decoratePlatformDropdown(platform, dropdown, hrefBase) {
    if (!dropdown) return;
    const storedId = localStorage.getItem(`currentSiteId:${platform}`);

    dropdown.querySelectorAll('li').forEach(li => {
      const link = li.querySelector('a[data-site-id]');
      if (!link) return;
      const siteId = link.dataset.siteId;
      if (siteId === storedId) {
        li.classList.add('active');
        link.style.background = 'var(--brand)';
        link.style.color = '#fff';
      } else {
        li.classList.remove('active');
        link.style.background = '';
        link.style.color = '';
      }

      link.addEventListener('click', e => {
        e.preventDefault();
        const displayName = link.dataset.siteName || link.textContent.trim();
        storePlatformSelection(platform, { id: siteId, display_name: displayName });
        const target = link.dataset.targetHref || hrefBase;
        const search = link.dataset.targetSearch || '';
        window.location.href = search ? `${target}${search}` : target;
      });
    });
  }

  function buildSelfOperatedMenu(siteConfigs = []) {
    const managedMenu = document.getElementById('managedMenu');
    if (!managedMenu) return;

    const currentSite = localStorage.getItem('currentSite');
    const currentSiteName = localStorage.getItem('currentSiteName');
    const configSites = siteConfigs.filter(site => site.platform === 'ae_self_operated');
    const mergedSites = mergeSiteEntries(defaultSites.ae_self_operated, configSites);

    managedMenu.innerHTML = '';

    mergedSites.forEach(site => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = 'self-operated.html';
      a.textContent = site.display_name;
      a.dataset.siteId = site.id;
      a.dataset.siteName = site.display_name;

      if (site.id === currentSite || site.display_name === currentSiteName) {
        li.className = 'active';
        a.style.background = 'var(--brand)';
        a.style.color = '#fff';
      }

      a.addEventListener('click', e => {
        e.preventDefault();
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
    managedA.addEventListener('click', e => {
      e.preventDefault();
      localStorage.removeItem('currentSite');
      localStorage.removeItem('currentSiteName');
      window.location.href = 'managed.html';
    });
    managedLi.appendChild(managedA);
    managedMenu.appendChild(managedLi);
  }

  function buildIndependentMenu(siteConfigs = []) {
    const indepMenu = document.getElementById('indepMenu');
    if (!indepMenu) return;

    const currentIndepSite = localStorage.getItem('currentIndepSite');
    const configSites = siteConfigs.filter(site => site.platform === 'independent');
    const mergedSites = mergeSiteEntries(defaultSites.independent, configSites);

    indepMenu.innerHTML = '';

    mergedSites.forEach(site => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const siteParam = site.name || site.id;
      a.href = `independent-site.html?site=${encodeURIComponent(siteParam)}`;
      a.textContent = site.display_name;
      a.dataset.siteId = site.id;
      a.dataset.siteName = site.display_name;

      if (site.id === currentIndepSite) {
        li.className = 'active';
        a.style.background = 'var(--brand)';
        a.style.color = '#fff';
      }

      a.addEventListener('click', e => {
        e.preventDefault();
        localStorage.setItem('currentIndepSite', site.id);
        localStorage.setItem('currentIndepSiteName', site.display_name);
        window.location.href = `independent-site.html?site=${encodeURIComponent(siteParam)}`;
      });

      li.appendChild(a);
      indepMenu.appendChild(li);
    });
  }

  function applyDynamicPlatforms(siteConfigs = []) {
    const nav = document.querySelector('.platform-nav');
    if (!nav) return;

    Object.entries(DYNAMIC_PLATFORM_INFO).forEach(([platform, info]) => {
      const configs = siteConfigs.filter(site => site.platform === platform);
      const shouldRender = configs.length || !info.optional;
      let li = nav.querySelector(`li[data-platform="${platform}"]`);

      if (!shouldRender) {
        if (li) li.remove();
        return;
      }

      if (!li) {
        li = document.createElement('li');
        li.dataset.platform = platform;
        if (info.className) li.classList.add(info.className);

        const anchor = document.createElement('a');
        anchor.href = info.href;
        anchor.textContent = info.label;
        li.appendChild(anchor);

        if (info.insertBefore) {
          const target = nav.querySelector(info.insertBefore);
          if (target) {
            nav.insertBefore(li, target);
          } else {
            nav.appendChild(li);
          }
        } else {
          nav.appendChild(li);
        }
      } else {
        if (info.className) li.classList.add(info.className);
        const anchor = li.querySelector(':scope > a');
        if (anchor) {
          anchor.href = info.href;
          anchor.textContent = info.label;
        }
      }

      let dropdown = li.querySelector('ul.dropdown');
      if (!dropdown) {
        dropdown = document.createElement('ul');
        dropdown.className = 'dropdown';
        li.appendChild(dropdown);
      }

      dropdown.innerHTML = '';

      const normalizedSites = dedupeSitesByLabel(configs.map(normalizeSiteConfig).filter(Boolean), platform);
      ensureSiteDefaults(platform, normalizedSites);

      normalizedSites.forEach(site => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        const display = site.display_name || site.name || site.id;
        const search = `?site=${encodeURIComponent(site.id)}&siteName=${encodeURIComponent(display)}`;
        link.href = `${info.href}${search}`;
        link.textContent = display;
        link.dataset.siteId = site.id;
        link.dataset.siteName = display;
        link.dataset.targetHref = info.href;
        link.dataset.targetSearch = search;
        item.appendChild(link);
        dropdown.appendChild(item);
      });

      decoratePlatformDropdown(platform, dropdown, info.href);

      const path = window.location.pathname;
      const matchKey = info.href.replace('.html', '');
      if (path.endsWith(info.href) || path.includes(matchKey)) {
        li.classList.add('active');
      } else {
        li.classList.remove('active');
      }
    });
  }
  
  // 站点名称映射函数
  function getSiteDisplayName(siteId, platform) {
    if (platform === 'ae_self_operated') {
      const siteMap = {
        'ae_self_operated_a': '自运营robot站',
        'ae_self_operated_poolslab_store': 'Poolslab运动娱乐'
      };
      return siteMap[siteId] || `自运营 ${siteId}`;
    } else if (platform === 'independent') {
      const siteMap = {
        'independent_poolsvacuum': 'poolsvacuum.com',
        'independent_icyberite': 'icyberite.com'
      };
      return siteMap[siteId] || `独立站 ${siteId}`;
    }
    return siteId;
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

    // 如果存在 currentManagedSite 元素，说明是全托管页面，不更新
    if (currentManagedSiteEl) {
      console.log('全托管页面，跳过站点名更新');
      return;
    }

    if (currentSiteEl) {
      const bodyPlatform = document.body?.dataset?.platform;
      if (bodyPlatform) {
        const params = new URLSearchParams(window.location.search);
        const querySiteId = params.get('site');
        const querySiteName = params.get('siteName');

        if (querySiteId) {
          localStorage.setItem(`currentSiteId:${bodyPlatform}`, querySiteId);
        }
        if (querySiteName) {
          localStorage.setItem(`currentSiteName:${bodyPlatform}`, querySiteName);
        }

        const storedPlatformName = localStorage.getItem(`currentSiteName:${bodyPlatform}`);
        const storedPlatformId = localStorage.getItem(`currentSiteId:${bodyPlatform}`);
        const fallbackName = currentSiteEl.dataset?.defaultName || document.body?.dataset?.defaultSiteName;

        if (storedPlatformName) {
          currentSiteEl.textContent = storedPlatformName;
          console.log(`${bodyPlatform} 页面更新站点显示:`, storedPlatformName);
          return;
        }

        if (storedPlatformId) {
          currentSiteEl.textContent = storedPlatformId;
          console.log(`${bodyPlatform} 页面使用站点ID显示:`, storedPlatformId);
          return;
        }

        if (fallbackName) {
          currentSiteEl.textContent = fallbackName;
          console.log(`${bodyPlatform} 页面使用默认站点显示:`, fallbackName);
          return;
        }
      }

      // 根据当前页面URL判断页面类型，而不是优先检查localStorage
      const currentPath = window.location.pathname;
      const isIndependentPage = currentPath.includes('independent-site');
      const isSelfOperatedPage = currentPath.includes('self-operated');
      
      if (isIndependentPage) {
        // 独立站页面：使用独立站相关的localStorage
        const currentIndepSiteId = localStorage.getItem('currentIndepSite');
        const currentIndepSiteName = localStorage.getItem('currentIndepSiteName');
        
        if (currentIndepSiteName) {
          currentSiteEl.textContent = currentIndepSiteName;
          console.log('独立站页面更新站点显示:', currentIndepSiteName);
        } else if (currentIndepSiteId) {
          // 根据站点ID映射到站点名称
          const siteNameMap = {
            'independent_icyberite': 'icyberite.com',
            'independent_poolsvacuum': 'poolsvacuum.com'
          };
          const displayName = siteNameMap[currentIndepSiteId] || '独立站';
          currentSiteEl.textContent = displayName;
          console.log('独立站页面更新站点显示:', displayName);
        } else {
          // 从URL参数获取站点名称
          const urlParams = new URLSearchParams(window.location.search);
          const siteParam = urlParams.get('site');
          if (siteParam) {
            currentSiteEl.textContent = siteParam;
            console.log('独立站页面从URL参数获取站点名称:', siteParam);
          } else {
            currentSiteEl.textContent = 'poolsvacuum.com';
            console.log('独立站页面使用默认名称: poolsvacuum.com');
          }
        }
      } else if (isSelfOperatedPage) {
        // 自运营页面：使用自运营相关的localStorage
        const currentSiteId = localStorage.getItem('currentSite');
        const currentSiteName = localStorage.getItem('currentSiteName');
        
        if (currentSiteId && currentSiteName) {
          // 显示站点名称而不是ID
          currentSiteEl.textContent = currentSiteName;
          console.log('自运营页面更新站点显示:', currentSiteName);
        } else if (currentSiteId) {
          // 使用站点名称映射函数获取显示名称
          const displayName = getSiteDisplayName(currentSiteId, 'ae_self_operated');
          currentSiteEl.textContent = displayName;
          // 同时更新localStorage中的站点名称
          localStorage.setItem('currentSiteName', displayName);
          console.log('自运营页面使用映射名称:', displayName);
        } else {
          // 默认显示
          currentSiteEl.textContent = '自运营robot站';
          console.log('自运营页面使用默认名称: 自运营robot站');
        }
      } else {
        // 其他页面：尝试智能判断
        const currentSiteId = localStorage.getItem('currentSite');
        const currentSiteName = localStorage.getItem('currentSiteName');
        const currentIndepSiteId = localStorage.getItem('currentIndepSite');
        const currentIndepSiteName = localStorage.getItem('currentIndepSiteName');
        
        if (currentSiteId && currentSiteName) {
          currentSiteEl.textContent = currentSiteName;
          console.log('其他页面使用自运营站点显示:', currentSiteName);
        } else if (currentIndepSiteId && currentIndepSiteName) {
          currentSiteEl.textContent = currentIndepSiteName;
          console.log('其他页面使用独立站站点显示:', currentIndepSiteName);
        } else {
          currentSiteEl.textContent = '自运营';
          console.log('其他页面使用默认名称: 自运营');
        }
      }
    }
  }

  // 渲染站点菜单
  async function renderSiteMenus(forceReload = false) {
    console.log('开始渲染站点菜单...');

    const siteConfigs = await getSiteConfigs(forceReload);
    buildSelfOperatedMenu(siteConfigs);
    buildIndependentMenu(siteConfigs);
    applyDynamicPlatforms(siteConfigs);

    console.log('站点菜单渲染完成');
    return siteConfigs;
  }

  // 设置下拉菜单事件
  function setupDropdownEvents() {
    const platformNavItems = document.querySelectorAll('.platform-nav > li');
    
    platformNavItems.forEach(item => {
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
        // 如果点击的是链接，不阻止默认行为，让链接正常工作
        if (e.target.tagName === 'A') {
          return;
        }
        // 如果点击的是菜单容器，切换显示状态
        if (dropdown.style.display === 'block') {
          dropdown.style.display = 'none';
        } else {
          dropdown.style.display = 'block';
        }
      });
    });
    
    // 确保所有导航链接都能正常工作
    const allNavLinks = document.querySelectorAll('.platform-nav a[href]');
    allNavLinks.forEach(link => {
      // 移除可能的事件阻止器
      link.addEventListener('click', (e) => {
        // 确保链接能正常工作
        console.log('导航链接点击:', link.href);

        // 检查当前页面类型，调用相应的平台切换处理函数
        const currentPath = window.location.pathname;
        const platformAttr = safeGetAttribute(link, 'data-platform', '').trim();
        if (
          currentPath.includes('self-operated') &&
          typeof window.handlePlatformSwitch === 'function' &&
          platformAttr
        ) {
          try {
            e.preventDefault();
            console.log('自运营页面平台切换:', platformAttr);
            window.handlePlatformSwitch(platformAttr);
            return;
          } catch (error) {
            console.warn('平台切换处理出错:', error);
            // 如果出错，让链接正常工作
          }
        }
        // 不阻止默认行为，让链接正常工作
      });
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

  async function bootstrapSiteMenus(forceReload = false) {
    const siteConfigs = await renderSiteMenus(forceReload);
    applyNavIcons();
    ensureAdminLink();
    setupDropdownEvents();
    updateCurrentSiteDisplay();
    document.dispatchEvent(new CustomEvent('menus-updated', {
      detail: { siteConfigs }
    }));
  }

  // 初始化函数
  async function initialize() {
    console.log('开始初始化站点菜单...');

    try {
      await bootstrapSiteMenus();
      console.log('站点菜单初始化完成');
    } catch (error) {
      console.error('站点菜单初始化失败:', error);
    }
  }

  // 全局函数，供其他页面调用
  window.renderSiteMenus = bootstrapSiteMenus;
  window.refreshSiteMenus = (forceReload = false) => bootstrapSiteMenus(forceReload);
  window.updateCurrentSiteDisplay = updateCurrentSiteDisplay;
  window.getPlatformSiteSelection = getPlatformSiteSelection;

  window.addEventListener('storage', event => {
    if (!event.key) return;
    if (event.key.startsWith('currentSiteId:') || event.key.startsWith('currentSiteName:')) {
      const parts = event.key.split(':');
      const platformKey = parts[1];
      if (platformKey) {
        notifyPlatformSelection(platformKey);
      }
    }
  });

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
