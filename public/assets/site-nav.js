// Handles shared site menus and injects default sidebar icons
(async function(){
  const icons={
    site:'<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operation:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    product:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>'
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

  async function render(){
    console.log('开始渲染站点菜单...');
    const managedMenu=document.getElementById('managedMenu');
    const indepMenu=document.getElementById('indepMenu');
    
    console.log('找到的菜单元素:', { managedMenu: !!managedMenu, indepMenu: !!indepMenu });
    
    // 先清空菜单
    if(managedMenu){
      managedMenu.innerHTML='';
    }
    if(indepMenu){
      indepMenu.innerHTML='';
    }
    
    // 从站点配置API获取所有站点（优先使用 site_configs 表）
    try {
      console.log('正在从API获取站点配置...');
      const response = await fetch('/api/site-configs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // 添加超时设置
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      console.log('站点配置API响应状态:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('站点配置API响应数据:', data);
      
      if (data && data.data && Array.isArray(data.data)) {
        const sites = data.data;
        console.log('从API获取的站点数据:', sites);
        
        // 更新速卖通自运营站点菜单
        const aeSelfOperatedSites = sites.filter(site => site.platform === 'ae_self_operated');
        console.log('速卖通自运营站点:', aeSelfOperatedSites);
        
        if (managedMenu) {
          console.log('开始渲染速卖通菜单...');
          
          // 添加自运营子菜单
          if (aeSelfOperatedSites.length > 0) {
            aeSelfOperatedSites.forEach(site => {
              const li = document.createElement('li');
              const a = document.createElement('a');
              a.href = 'self-operated.html';
              a.textContent = site.display_name || site.name;
              a.addEventListener('click', e => {
                e.preventDefault();
                localStorage.setItem('currentSite', site.id);
                localStorage.setItem('currentSiteName', site.display_name || site.name);
                window.location.href = 'self-operated.html';
              });
              li.appendChild(a);
              managedMenu.appendChild(li);
              console.log('添加速卖通菜单项:', site.display_name || site.name);
            });
          }
          
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
        
        // 更新独立站站点菜单
        const independentSites = sites.filter(site => site.platform === 'independent');
        console.log('独立站站点:', independentSites);
        
        if (indepMenu) {
          console.log('开始渲染独立站菜单...');
          if (independentSites.length > 0) {
            independentSites.forEach(site => {
              const li = document.createElement('li');
              const a = document.createElement('a');
              a.href = 'independent-site.html';
              a.textContent = site.display_name || site.name;
              a.addEventListener('click', e => {
                e.preventDefault();
                localStorage.setItem('currentIndepSite', site.id);
                localStorage.setItem('currentIndepSiteName', site.display_name || site.name);
                window.location.href = 'independent-site.html?site=' + encodeURIComponent(site.name);
              });
              li.appendChild(a);
              indepMenu.appendChild(li);
              console.log('添加独立站菜单项:', site.display_name || site.name);
            });
          }
        }
        
        console.log('站点菜单渲染完成');
      } else {
        console.warn('站点配置API返回的数据格式不正确:', data);
        // 如果数据格式不正确，尝试使用 sites 表作为备选
        await renderFallbackSites();
      }
    } catch (error) {
      console.error('获取站点配置失败:', error.message);
      // 如果 site_configs API 失败，尝试使用 sites 表作为备选
      await renderFallbackSites();
    }
    
    applyNavIcons();
    updateCurrentSiteDisplay(); // 更新当前站点显示
    
    // 添加下拉菜单的JavaScript事件处理，确保菜单显示稳定性
    setupDropdownMenus();
  }
  
  // 设置下拉菜单的JavaScript事件处理
  function setupDropdownMenus() {
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
        if (e.target.tagName === 'A' && dropdown) {
          // 如果点击的是链接，不阻止默认行为
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
    
    console.log('下拉菜单事件处理已设置');
  }

  // 备选方案：使用 sites 表数据
  async function renderFallbackSites() {
    console.log('使用备选方案：从 sites 表获取数据...');
    try {
      const response = await fetch('/api/sites', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      console.log('Sites API响应状态:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Sites API响应数据:', data);
      
      if (data && data.data && Array.isArray(data.data)) {
        const sites = data.data;
        console.log('从 sites 表获取的数据:', sites);
        
        // 渲染速卖通菜单
        const managedMenu = document.getElementById('managedMenu');
        if (managedMenu) {
          const aeSelfOperatedSites = sites.filter(site => site.platform === 'ae_self_operated');
          aeSelfOperatedSites.forEach(site => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = 'index.html';
            a.textContent = site.display_name || site.name;
            a.addEventListener('click', e => {
              e.preventDefault();
              localStorage.setItem('currentSite', site.id);
              localStorage.setItem('currentSiteName', site.display_name || site.name);
              window.location.href = 'index.html';
            });
            li.appendChild(a);
            managedMenu.appendChild(li);
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
        }
        
        // 渲染独立站菜单
        const indepMenu = document.getElementById('indepMenu');
        if (indepMenu) {
          const independentSites = sites.filter(site => site.platform === 'independent');
          independentSites.forEach(site => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = 'independent-site.html';
            a.textContent = site.display_name || site.name;
            a.addEventListener('click', e => {
              e.preventDefault();
              localStorage.setItem('currentIndepSite', site.id);
              localStorage.setItem('currentIndepSiteName', site.display_name || site.name);
              window.location.href = 'independent-site.html?site=' + encodeURIComponent(site.name);
            });
            li.appendChild(a);
            indepMenu.appendChild(li);
          });
        }
        
        console.log('备选方案渲染完成');
      } else {
        console.error('Sites API返回的数据格式不正确:', data);
        // 如果所有API都失败，使用默认数据
        renderDefaultSites();
      }
    } catch (error) {
      console.error('备选方案也失败了:', error.message);
      // 如果所有API都失败，使用默认数据
      renderDefaultSites();
    }
  }

  // 最后的备选方案：使用默认站点数据
  function renderDefaultSites() {
    console.log('使用默认站点数据...');
    
    const managedMenu = document.getElementById('managedMenu');
    if (managedMenu) {
      // 添加默认的速卖通自运营站点
      const defaultSites = [
        { id: 'ae_self_operated_a', name: '自运营robot站', display_name: '自运营robot站' },
        { id: 'ae_self_operated_poolslab', name: 'poolslab', display_name: 'Poolslab运动娱乐' }
      ];
      
      defaultSites.forEach(site => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = 'index.html';
        a.textContent = site.display_name;
        a.addEventListener('click', e => {
          e.preventDefault();
          localStorage.setItem('currentSite', site.id);
          localStorage.setItem('currentSiteName', site.display_name);
          window.location.href = 'index.html';
        });
        li.appendChild(a);
        managedMenu.appendChild(li);
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
    }
    
    const indepMenu = document.getElementById('indepMenu');
    if (indepMenu) {
      // 添加默认的独立站站点
      const defaultIndepSites = [
        { id: 'independent_poolsvacuum', name: 'poolsvacuum', display_name: '独立站poolsvacuum' },
        { id: 'independent_icyberite', name: 'icyberite', display_name: '独立站icyberite.com' }
      ];
      
      defaultIndepSites.forEach(site => {
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
      });
    }
    
    console.log('默认站点数据渲染完成');
  }

  // 全局刷新函数
  window.refreshSiteMenus = render;
  
  // 添加renderSiteMenus函数作为render的别名，以兼容现有代码
  window.renderSiteMenus = render;
  
  // 防止重复初始化的标志
  let isInitialized = false;
  
  // 初始化函数
  function initialize() {
    if (isInitialized) {
      console.log('已经初始化过，跳过重复初始化');
      return;
    }
    
    console.log('开始初始化站点菜单...');
    render();
    applyNavIcons();
    updateCurrentSiteDisplay();
    isInitialized = true;
    
    // 监听页面可见性变化，重新渲染菜单
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        render();
      }
    });
    
    // 定期刷新菜单（每30秒）
    setInterval(render, 30000);
  }
  
  // 初始化
  initialize();
})();
