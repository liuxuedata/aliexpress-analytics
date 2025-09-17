// Handles shared site menus and injects default sidebar icons
(function(){
  const icons={
    site:'<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operation:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    product:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>',
    orders:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><path d="M7 4h10l4 4H3l4-4Z"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>',
    advertising:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a4 4 0 0 0 4 4h3l5 3v-6h3a4 4 0 0 0 4-4v-2"/><path d="M7 15v-6"/><path d="M3 7a4 4 0 0 0 4 4h3l5 3V4l-5 3H7a4 4 0 0 1-4-4"/></svg>'
  };

  // 默认站点配置
  const defaultSites = {
    ae_self_operated: [
      { id: 'ae_self_operated_a', name: '自运营robot站', display_name: '自运营robot站' },
      { id: 'ae_self_operated_poolslab_store', name: 'poolslab', display_name: 'Poolslab运动娱乐' }
    ],
    independent: [
      { id: 'independent_poolsvacuum', name: 'poolsvacuum', display_name: 'poolsvacuum.com' },
      { id: 'independent_icyberite', name: 'icyberite', display_name: 'icyberite.com' }
    ]
  };
  
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
  function renderSiteMenus() {
    console.log('开始渲染站点菜单...');
    
    const managedMenu = document.getElementById('managedMenu');
    const indepMenu = document.getElementById('indepMenu');
    
    console.log('找到的菜单元素:', { managedMenu: !!managedMenu, indepMenu: !!indepMenu });
    
    // 渲染速卖通菜单
    if (managedMenu) {
      managedMenu.innerHTML = '';
      
      // 获取当前自运营站点
      const currentSite = localStorage.getItem('currentSite');
      
      // 添加自运营站点
      defaultSites.ae_self_operated.forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'self-operated.html';
        a.textContent = site.display_name;
        
        // 如果是当前站点，添加高亮样式
        if (site.id === currentSite) {
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
        console.log('添加速卖通菜单项:', site.display_name);
      });
      
      // 添加全托管选项
      const managedLi = document.createElement('li');
      const managedA = document.createElement('a');
      managedA.href = 'managed.html';
      managedA.textContent = '全托管';
      managedA.addEventListener('click', e => {
        e.preventDefault();
        // 清除自运营相关的localStorage
        localStorage.removeItem('currentSite');
        localStorage.removeItem('currentSiteName');
        window.location.href = 'managed.html';
      });
      managedLi.appendChild(managedA);
      managedMenu.appendChild(managedLi);
      console.log('添加全托管菜单项');
    }
    
    // 渲染独立站菜单
    if (indepMenu) {
      indepMenu.innerHTML = '';
      
      // 获取当前独立站站点
      const currentIndepSite = localStorage.getItem('currentIndepSite');
      
      defaultSites.independent.forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'independent-site.html';
        a.textContent = site.display_name;
        
        // 如果是当前站点，添加高亮样式
        if (site.id === currentIndepSite) {
          li.className = 'active';
          a.style.background = 'var(--brand)';
          a.style.color = '#fff';
        }
        
        a.addEventListener('click', e => {
          e.preventDefault();
          localStorage.setItem('currentIndepSite', site.id);
          localStorage.setItem('currentIndepSiteName', site.display_name);
          window.location.href = 'independent-site.html?site=' + encodeURIComponent(site.name);
        });
        li.appendChild(a);
        indepMenu.appendChild(li);
        console.log('添加独立站菜单项:', site.display_name);
      });
    }
    
    console.log('站点菜单渲染完成');
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

        if (link.dataset.dropdownTrigger === 'true') {
          e.preventDefault();
          return;
        }

                 // 检查当前页面类型，调用相应的平台切换处理函数
         const currentPath = window.location.pathname;
         if (currentPath.includes('self-operated')) {
           // 自运营页面：调用平台切换处理
           if (window.handlePlatformSwitch && link && link.getAttribute) {
             try {
               e.preventDefault();
               const platform = link.getAttribute('data-platform') || link.textContent.trim();
               console.log('自运营页面平台切换:', platform);
               window.handlePlatformSwitch(platform);
               return;
             } catch (error) {
               console.warn('平台切换处理出错:', error);
               // 如果出错，让链接正常工作
             }
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

  // 初始化函数
  function initialize() {
    console.log('开始初始化站点菜单...');
    
    try {
      // 立即渲染菜单
      renderSiteMenus();
      applyNavIcons();
      updateCurrentSiteDisplay();
      ensureAdminLink();
      ensureGlobalLinks();
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

  function ensureGlobalLinks() {
    const platformNav = document.querySelector('.platform-nav');
    if (!platformNav) return;

    let globalItem = platformNav.querySelector('li.global-modules');
    if (globalItem) {
      const trigger = globalItem.querySelector('a');
      if (trigger) {
        trigger.setAttribute('data-dropdown-trigger', 'true');
        trigger.setAttribute('role', 'button');
      }
      const dropdown = globalItem.querySelector('.dropdown');
      if (dropdown && !dropdown.querySelector('a[href="inventory-management.html"]')) {
        dropdown.appendChild(createGlobalLink('库存管理', 'inventory-management.html'));
      }
      if (dropdown && !dropdown.querySelector('a[href="permissions-management.html"]')) {
        dropdown.appendChild(createGlobalLink('权限管理', 'permissions-management.html'));
      }
      if (dropdown && !dropdown.querySelector('a[href="site-management.html"]')) {
        dropdown.appendChild(createGlobalLink('站点配置', 'site-management.html'));
      }
      return;
    }

    globalItem = document.createElement('li');
    globalItem.className = 'global-modules';

    const trigger = document.createElement('a');
    trigger.href = '#';
    trigger.textContent = '全局设置';
    trigger.setAttribute('data-dropdown-trigger', 'true');
    trigger.setAttribute('role', 'button');

    const dropdown = document.createElement('ul');
    dropdown.className = 'dropdown';
    dropdown.appendChild(createGlobalLink('库存管理', 'inventory-management.html'));
    dropdown.appendChild(createGlobalLink('权限管理', 'permissions-management.html'));
    dropdown.appendChild(createGlobalLink('站点配置', 'site-management.html'));

    globalItem.appendChild(trigger);
    globalItem.appendChild(dropdown);
    platformNav.appendChild(globalItem);
  }

  function createGlobalLink(label, href) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    li.appendChild(link);
    return li;
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
