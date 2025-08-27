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
    const indepMenu=document.getElementById('indepMenu');
    if(indepMenu){
      indepMenu.innerHTML='';
      const currentKey='currentIndepSite';
      try{
        const resp=await fetch('/api/independent/sites');
        const j=await resp.json();
        const sites=Array.from(new Set([...(j.sites||[]), 'icyberite.com'].filter(Boolean)));
        sites.forEach(name=>{
          const li=document.createElement('li');
          const a=document.createElement('a');
          a.href='independent-site.html';
          a.textContent=name;
          a.addEventListener('click',e=>{
            e.preventDefault();
            localStorage.setItem(currentKey,name);
            window.location.href='independent-site.html';
          });
          li.appendChild(a);
          indepMenu.appendChild(li);
        });
      }catch(e){
        console.error('independent site list load failed',e);
      }
    }
    applyNavIcons();
  }

  window.renderSiteMenus=render;
  document.addEventListener('DOMContentLoaded',render);
})();
