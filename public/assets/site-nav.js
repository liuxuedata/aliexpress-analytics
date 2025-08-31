// Handles shared site menus and injects default sidebar icons
(async function(){
  const icons={
    site:'<svg class="site-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>',
    detail:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',
    operation:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 3h7v7"/></svg>',
    product:'<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3v8h8"/></svg>'
  };

  function applyNavIcons(){
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
    
    // 从站点配置API获取所有站点
    try {
      console.log('正在从API获取站点配置...');
      const response = await fetch('/api/site-configs');
      const data = await response.json();
      
      if (response.ok && data.data) {
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
              console.log('添加速卖通菜单项:', site.display_name || site.name);
            });
          }
          
          // 添加全托管选项
          const managedLi = document.createElement('li');
          const managedA = document.createElement('a');
          managedA.href = 'managed.html';
          managedA.textContent = '全托管';
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
        console.error('API返回错误:', data);
      }
    } catch (error) {
      console.error('获取站点配置失败:', error);
    }
    
    applyNavIcons();
  }

  // 全局刷新函数
  window.refreshSiteMenus = render;
  
  // 初始渲染
  await render();
  
  // 监听页面可见性变化，重新渲染菜单
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render();
    }
  });
  
  // 定期刷新菜单（每30秒）
  setInterval(render, 30000);
})();
