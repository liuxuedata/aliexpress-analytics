// Handles shared site menus and injects default sidebar icons
(function(){
  const icons={
    site:'<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operation:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    product:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>'
  };

  // 默认站点配置
  const defaultSites = {
    ae_self_operated: [
      { id: 'ae_self_operated_a', name: '自运营robot站', display_name: '自运营robot站' },
      { id: 'ae_self_operated_poolslab', name: 'poolslab', display_name: 'Poolslab运动娱乐' }
    ],
    independent: [
      { id: 'independent_poolsvacuum', name: 'poolsvacuum', display_name: 'poolsvacuum.com' },
      { id: 'independent_icyberite', name: 'icyberite', display_name: 'icyberite.com' }
    ]
  };

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
      const currentSiteId = localStorage.getItem('currentSite');
      const currentSiteName = localStorage.getItem('currentSiteName');
      
      if (currentSiteId && currentSiteName) {
        // 显示站点名称而不是ID
        currentSiteEl.textContent = currentSiteName;
        console.log('更新站点显示:', currentSiteName);
      } else if (currentSiteId) {
        // 如果没有站点名称，显示默认名称
        currentSiteEl.textContent = '自运营';
        console.log('使用默认站点显示');
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
      
      // 添加自运营站点
      defaultSites.ae_self_operated.forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'self-operated.html';
        a.textContent = site.display_name;
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
      
      defaultSites.independent.forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'independent-site.html';
        a.textContent = site.display_name;
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
        // 不阻止默认行为，让链接正常工作
      });
    });
    
    console.log('下拉菜单事件处理已设置');
  }

  // 初始化函数
  function initialize() {
    console.log('开始初始化站点菜单...');
    
    // 立即渲染菜单
    renderSiteMenus();
    applyNavIcons();
    updateCurrentSiteDisplay();
    setupDropdownEvents();
    
    console.log('站点菜单初始化完成');
  }

  // 全局函数，供其他页面调用
  window.renderSiteMenus = renderSiteMenus;
  window.refreshSiteMenus = renderSiteMenus;
  window.updateCurrentSiteDisplay = updateCurrentSiteDisplay;

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
