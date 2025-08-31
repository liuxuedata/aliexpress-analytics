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
    const managedMenu=document.getElementById('managedMenu');
    if(managedMenu){
      managedMenu.innerHTML='<li><a href="index.html">自运营</a></li><li><a href="managed.html">全托管</a></li>';
    }
    
    // 从站点配置API获取所有站点
    try {
      const response = await fetch('/api/site-configs');
      const data = await response.json();
      
      if (response.ok && data.data) {
        const sites = data.data;
        console.log('从API获取的站点数据:', sites);
        
        // 更新速卖通自运营站点菜单
        const aeSelfOperatedSites = sites.filter(site => site.platform === 'ae_self_operated');
        if (aeSelfOperatedSites.length > 0) {
          const managedMenu = document.getElementById('managedMenu');
          if (managedMenu) {
            managedMenu.innerHTML = '';
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
          }
        }
        
        // 更新独立站站点菜单
        const independentSites = sites.filter(site => site.platform === 'independent');
        const indepMenu = document.getElementById('indepMenu');
        if (indepMenu && independentSites.length > 0) {
          indepMenu.innerHTML = '';
          independentSites.forEach(site => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = 'independent-site.html';
            a.textContent = site.display_name || site.name;
            a.addEventListener('click', e => {
              e.preventDefault();
              localStorage.setItem('currentIndepSite', site.id);
              localStorage.setItem('currentIndepSiteName', site.display_name || site.name);
              window.location.href = 'independent-site.html';
            });
            li.appendChild(a);
            indepMenu.appendChild(li);
          });
        }
      }
    } catch (e) {
      console.error('站点配置API加载失败:', e);
    }
    
    applyNavIcons();
  }

  function renderFooter(){
    const footer=document.createElement('footer');
    footer.style.textAlign='center';
    footer.style.fontSize='12px';
    footer.style.margin='2rem 0';
    footer.innerHTML='<a href="consent-privacy-notice.html" target="_blank">Consent & Privacy Notice / 同意与隐私声明</a>';
    document.body.appendChild(footer);
  }

  window.renderSiteMenus=render;
  
  // 添加全局刷新函数
  window.refreshSiteMenus = async () => {
    console.log('刷新站点菜单...');
    await render();
  };
  
  document.addEventListener('DOMContentLoaded',render);
  document.addEventListener('DOMContentLoaded',renderFooter);
})();
