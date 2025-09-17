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

  const FALLBACK_SITES={
    ae_self_operated:[
      {id:'ae_self_operated_a',name:'自运营robot站',display_name:'自运营robot站'},
      {id:'ae_self_operated_poolslab_store',name:'poolslab',display_name:'Poolslab运动娱乐'}
    ],
    independent:[
      {id:'independent_poolsvacuum',name:'poolsvacuum',display_name:'poolsvacuum.com'},
      {id:'independent_icyberite',name:'icyberite',display_name:'icyberite.com'}
    ]
  };

  const FALLBACK_LABELS={
    ae_self_operated:{
      ae_self_operated_a:'自运营robot站',
      ae_self_operated_poolslab_store:'Poolslab运动娱乐'
    },
    independent:{
      independent_poolsvacuum:'poolsvacuum.com',
      independent_icyberite:'icyberite.com'
    }
  };

  const PLATFORM_LABELS={
    ae_self_operated:'速卖通',
    ae_managed:'速卖通全托管',
    amazon:'亚马逊',
    ozon:'Ozon',
    tiktok:'TikTok Shop',
    temu:'Temu',
    independent:'独立站',
    lazada:'Lazada',
    shopee:'Shopee'
  };

  const PLATFORM_ROUTE_MAP={
    ae_self_operated:{page:'self-operated.html'},
    ae_managed:{page:'managed.html'},
    independent:{page:'independent-site.html',queryKey:'site',value:'name'},
    amazon:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    ozon:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    tiktok:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    temu:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    lazada:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    shopee:{page:'site-dashboard.html',queryKey:'site',value:'id'},
    default:{page:'site-dashboard.html',queryKey:'site',value:'id'}
  };

  const RESERVED_PLATFORMS=new Set(['ae_self_operated','ae_managed','independent','amazon','tiktok','temu','ozon']);
  const DYNAMIC_PLATFORM_ORDER=['lazada','shopee','amazon','tiktok','temu','ozon'];

  let cachedSites=null;

  function normalizeSiteRecord(record){
    if(!record) return null;
    const id=String(record.id||record.site_id||record.name||'').trim();
    if(!id) return null;
    const platform=String(record.platform||'').trim().toLowerCase()||'unknown';
    const displayName=record.display_name||record.name||record.domain||id;
    const isActive=record.is_active!==false&&record.is_active!=='false';
    return{
      id,
      platform,
      name:record.name||id,
      displayName,
      domain:record.domain||'',
      dataSource:record.data_source||'',
      templateId:record.template_id||'',
      isActive,
      raw:record
    };
  }

  function groupSitesByPlatform(list){
    const result={};
    (list||[]).forEach(site=>{
      const key=site.platform||'unknown';
      if(!result[key]) result[key]=[];
      result[key].push(site);
    });
    return result;
  }

  function getPlatformLabel(platform){
    if(!platform) return '未分类';
    const key=String(platform).toLowerCase();
    if(PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
    return key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }

  function buildSiteUrl(site){
    if(!site) return '#';
    const route=PLATFORM_ROUTE_MAP[site.platform]||PLATFORM_ROUTE_MAP.default;
    if(!route.queryKey){
      return route.page;
    }
    const value=route.value==='name'?site.name:site.id;
    return `${route.page}?${route.queryKey}=${encodeURIComponent(value)}`;
  }

  async function fetchSiteConfigs(){
    if(Array.isArray(cachedSites)) return cachedSites;
    try{
      const res=await fetch('/api/site-configs');
      if(!res.ok) throw new Error(`Failed to load site configs: ${res.status}`);
      const payload=await res.json();
      const list=Array.isArray(payload?.data)?payload.data:[];
      cachedSites=list
        .map(normalizeSiteRecord)
        .filter(site=>site&&site.isActive);
    }catch(error){
      console.warn('[site-nav] fetch site configs failed, fallback to defaults',error);
      cachedSites=[];
    }
    window.__SITE_CONFIGS__=cachedSites;
    return cachedSites;
  }

  function fallbackSitesToRecords(platform){
    return(FALLBACK_SITES[platform]||[]).map(site=>(
      {
        id:site.id,
        platform,
        name:site.name||site.display_name||site.id,
        displayName:site.display_name||site.name||site.id,
        domain:'',
        dataSource:'',
        templateId:'',
        isActive:true,
        raw:site
      }
    ));
  }

  function renderSelfOperatedMenu(selfSites,managedSites){
    const managedMenu=document.getElementById('managedMenu');
    if(!managedMenu) return;

    managedMenu.innerHTML='';

    const dataList=(Array.isArray(selfSites)&&selfSites.length>0)
      ?selfSites.slice()
      :fallbackSitesToRecords('ae_self_operated');

    const currentSite=localStorage.getItem('currentSite');

    dataList.sort((a,b)=>{
      const nameA=a.displayName||a.name||a.id;
      const nameB=b.displayName||b.name||b.id;
      return nameA.localeCompare(nameB,'zh-CN');
    });

    dataList.forEach(site=>{
      const li=document.createElement('li');
      const a=document.createElement('a');
      a.href='self-operated.html';
      a.textContent=site.displayName||site.name||site.id;
      a.dataset.siteId=site.id;
      a.dataset.platform=site.platform;

      if(site.id===currentSite){
        li.classList.add('active');
        a.classList.add('active');
        a.style.background='var(--brand)';
        a.style.color='#fff';
      }

      a.addEventListener('click',e=>{
        e.preventDefault();
        localStorage.setItem('currentSite',site.id);
        localStorage.setItem('currentSiteName',site.displayName||site.name||site.id);
        window.location.href='self-operated.html';
      });

      li.appendChild(a);
      managedMenu.appendChild(li);
    });

    const managedSiteList=Array.isArray(managedSites)?managedSites.slice():[];
    managedSiteList.sort((a,b)=>{
      const nameA=a.displayName||a.name||a.id;
      const nameB=b.displayName||b.name||b.id;
      return nameA.localeCompare(nameB,'zh-CN');
    });

    managedSiteList.forEach(site=>{
      const li=document.createElement('li');
      const a=document.createElement('a');
      a.href=buildSiteUrl(site);
      a.textContent=site.displayName||site.name||site.id;
      a.dataset.siteId=site.id;
      a.dataset.platform=site.platform;
      li.appendChild(a);
      managedMenu.appendChild(li);
    });

    const managedLi=document.createElement('li');
    managedLi.dataset.navStatic='managed';
    const managedA=document.createElement('a');
    managedA.href='managed.html';
    managedA.textContent='全托管';
    managedA.addEventListener('click',e=>{
      e.preventDefault();
      localStorage.removeItem('currentSite');
      localStorage.removeItem('currentSiteName');
      window.location.href='managed.html';
    });
    managedLi.appendChild(managedA);
    managedMenu.appendChild(managedLi);
  }

  function renderIndependentMenu(independentSites){
    const indepMenu=document.getElementById('indepMenu');
    if(!indepMenu) return;

    indepMenu.innerHTML='';

    const dataList=(Array.isArray(independentSites)&&independentSites.length>0)
      ?independentSites.slice()
      :fallbackSitesToRecords('independent');

    const currentSite=localStorage.getItem('currentIndepSite');

    dataList.sort((a,b)=>{
      const nameA=a.displayName||a.name||a.id;
      const nameB=b.displayName||b.name||b.id;
      return nameA.localeCompare(nameB,'zh-CN');
    });

    dataList.forEach(site=>{
      const li=document.createElement('li');
      const a=document.createElement('a');
      const paramValue=site.name||site.displayName||site.id;
      a.href=`independent-site.html?site=${encodeURIComponent(paramValue)}`;
      a.textContent=site.displayName||site.name||site.id;
      a.dataset.siteId=site.id;
      a.dataset.platform=site.platform;

      if(site.id===currentSite){
        li.classList.add('active');
        a.classList.add('active');
        a.style.background='var(--brand)';
        a.style.color='#fff';
      }

      a.addEventListener('click',e=>{
        e.preventDefault();
        localStorage.setItem('currentIndepSite',site.id);
        localStorage.setItem('currentIndepSiteName',site.displayName||site.name||site.id);
        window.location.href=`independent-site.html?site=${encodeURIComponent(paramValue)}`;
      });

      li.appendChild(a);
      indepMenu.appendChild(li);
    });
  }

  function renderAdditionalPlatforms(groupedSites){
    const nav=document.querySelector('.platform-nav');
    if(!nav) return;

    nav.querySelectorAll('li[data-dynamic-platform]').forEach(node=>node.remove());

    const platforms=Object.keys(groupedSites||{})
      .filter(platform=>!RESERVED_PLATFORMS.has(platform) && Array.isArray(groupedSites[platform]) && groupedSites[platform].length>0);

    if(platforms.length===0) return;

    platforms.sort((a,b)=>{
      const indexA=DYNAMIC_PLATFORM_ORDER.indexOf(a);
      const indexB=DYNAMIC_PLATFORM_ORDER.indexOf(b);
      if(indexA!==-1||indexB!==-1){
        if(indexA===-1) return 1;
        if(indexB===-1) return -1;
        return indexA-indexB;
      }
      return getPlatformLabel(a).localeCompare(getPlatformLabel(b),'zh-CN');
    });

    const adminItem=nav.querySelector('li.admin');

    platforms.forEach(platform=>{
      const sites=groupedSites[platform];
      if(!Array.isArray(sites)||sites.length===0) return;

      const li=document.createElement('li');
      li.setAttribute('data-dynamic-platform',platform);
      li.className=`platform-${platform}`;

      const sortedSites=sites.slice().sort((a,b)=>{
        const nameA=a.displayName||a.name||a.id;
        const nameB=b.displayName||b.name||b.id;
        return nameA.localeCompare(nameB,'zh-CN');
      });

      const anchor=document.createElement('a');
      const defaultSite=sortedSites[0];
      anchor.href=buildSiteUrl(defaultSite);
      anchor.textContent=getPlatformLabel(platform);
      anchor.dataset.platform=platform;
      anchor.dataset.siteId=defaultSite.id;
      li.appendChild(anchor);

      const dropdown=document.createElement('ul');
      dropdown.className='dropdown';
      sortedSites.forEach(site=>{
        const item=document.createElement('li');
        const link=document.createElement('a');
        link.href=buildSiteUrl(site);
        link.textContent=site.displayName||site.name||site.id;
        link.dataset.siteId=site.id;
        link.dataset.platform=site.platform;
        item.appendChild(link);
        dropdown.appendChild(item);
      });

      li.appendChild(dropdown);

      if(adminItem){
        nav.insertBefore(li,adminItem);
      }else{
        nav.appendChild(li);
      }
    });
  }

  function getSiteDisplayName(siteId,platform){
    if(!siteId) return '';
    const normalizedId=String(siteId).trim();
    if(!normalizedId) return '';
    const cached=Array.isArray(window.__SITE_CONFIGS__)?window.__SITE_CONFIGS__:[];
    const match=cached.find(site=>site.id===normalizedId);
    if(match){
      return match.displayName||match.name||normalizedId;
    }
    if(platform&&FALLBACK_LABELS[platform]&&FALLBACK_LABELS[platform][normalizedId]){
      return FALLBACK_LABELS[platform][normalizedId];
    }
    for(const key of Object.keys(FALLBACK_LABELS)){
      if(FALLBACK_LABELS[key][normalizedId]){
        return FALLBACK_LABELS[key][normalizedId];
      }
    }
    return normalizedId;
  }

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
      else if(/订单/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.orders);
      else if(/广告/.test(txt)) a.insertAdjacentHTML('afterbegin',icons.advertising);
    });
  }

  function updateCurrentSiteDisplay(){
    const currentSiteEl=document.getElementById('currentSite');
    const currentManagedSiteEl=document.getElementById('currentManagedSite');

    if(currentManagedSiteEl){
      console.log('全托管页面，跳过站点名更新');
      return;
    }

    if(!currentSiteEl) return;

    const currentPath=window.location.pathname;
    const params=new URLSearchParams(window.location.search);

    if(currentPath.includes('independent-site')){
      const currentIndepSiteId=localStorage.getItem('currentIndepSite');
      if(currentIndepSiteId){
        const displayName=getSiteDisplayName(currentIndepSiteId,'independent');
        currentSiteEl.textContent=displayName;
        localStorage.setItem('currentIndepSiteName',displayName);
        return;
      }
      const siteParam=params.get('site');
      if(siteParam){
        currentSiteEl.textContent=siteParam;
        return;
      }
      currentSiteEl.textContent='独立站';
      return;
    }

    if(currentPath.includes('self-operated')){
      const currentSiteId=localStorage.getItem('currentSite')||'ae_self_operated_a';
      const displayName=getSiteDisplayName(currentSiteId,'ae_self_operated');
      currentSiteEl.textContent=displayName;
      localStorage.setItem('currentSite',currentSiteId);
      localStorage.setItem('currentSiteName',displayName);
      return;
    }

    const siteFromQuery=params.get('site')||params.get('siteId');
    if(siteFromQuery){
      currentSiteEl.textContent=getSiteDisplayName(siteFromQuery)||siteFromQuery;
      return;
    }

    const storedName=localStorage.getItem('currentSiteName')||localStorage.getItem('currentIndepSiteName');
    if(storedName){
      currentSiteEl.textContent=storedName;
      return;
    }

    currentSiteEl.textContent='自运营';
  }

  function getActiveSiteId(){
    const path=window.location.pathname;
    if(path.includes('self-operated')){
      return localStorage.getItem('currentSite');
    }
    if(path.includes('independent-site')){
      return localStorage.getItem('currentIndepSite');
    }
    const params=new URLSearchParams(window.location.search);
    if(params.get('site')){
      return params.get('site');
    }
    if(params.get('siteId')){
      return params.get('siteId');
    }
    return localStorage.getItem('currentDynamicSite');
  }

  function highlightActivePlatformLink(){
    const activeSiteId=getActiveSiteId();
    if(!activeSiteId) return;

    const navLinks=document.querySelectorAll('.platform-nav a[data-site-id]');
    navLinks.forEach(link=>{
      if(link.closest('#managedMenu')||link.closest('#indepMenu')){
        return;
      }
      link.classList.remove('active');
      const li=link.closest('li');
      if(li) li.classList.remove('active');
      const parentLi=link.closest('ul.dropdown')?.parentElement;
      if(parentLi&&parentLi.tagName==='LI') parentLi.classList.remove('active');
    });

    navLinks.forEach(link=>{
      if(link.closest('#managedMenu')||link.closest('#indepMenu')){
        return;
      }
      if(link.dataset.siteId===activeSiteId){
        link.classList.add('active');
        const li=link.closest('li');
        if(li) li.classList.add('active');
        const parentLi=link.closest('ul.dropdown')?.parentElement;
        if(parentLi&&parentLi.tagName==='LI') parentLi.classList.add('active');
      }
    });
  }

  function setupDropdownEvents(){
    const platformNavItems=document.querySelectorAll('.platform-nav > li');

    platformNavItems.forEach(item=>{
      const dropdown=item.querySelector('.dropdown');
      if(!dropdown) return;
      if(item.dataset.dropdownBound==='true') return;
      item.dataset.dropdownBound='true';

      item.addEventListener('mouseenter',()=>{
        dropdown.style.display='block';
      });

      item.addEventListener('mouseleave',()=>{
        dropdown.style.display='none';
      });

      item.addEventListener('click',e=>{
        if(e.target.tagName==='A'){
          return;
        }
        if(dropdown.style.display==='block'){
          dropdown.style.display='none';
        }else{
          dropdown.style.display='block';
        }
      });
    });

    const allNavLinks=document.querySelectorAll('.platform-nav a[href]');
    allNavLinks.forEach(link=>{
      if(link.dataset.navLinkBound==='true') return;
      link.dataset.navLinkBound='true';
      link.addEventListener('click',e=>{
        console.log('导航链接点击:',link.href);
        const currentPath=window.location.pathname;
        if(currentPath.includes('self-operated')){
          if(window.handlePlatformSwitch&&link&&link.getAttribute){
            try{
              e.preventDefault();
              const platform=link.getAttribute('data-platform')||link.textContent.trim();
              console.log('自运营页面平台切换:',platform);
              window.handlePlatformSwitch(platform);
              return;
            }catch(error){
              console.warn('平台切换处理出错:',error);
            }
          }
        }
      });
    });
  }

  function ensureAdminLink(){
    const platformNav=document.querySelector('.platform-nav');
    if(!platformNav) return;

    const existing=platformNav.querySelector('a[href="admin.html"]');
    if(existing){
      existing.setAttribute('title','站点与权限统一管理后台');
      return;
    }

    const adminItem=document.createElement('li');
    adminItem.className='admin';

    const adminLink=document.createElement('a');
    adminLink.href='admin.html';
    adminLink.textContent='管理后台';
    adminLink.title='站点配置、权限矩阵与全局设置入口';

    adminItem.appendChild(adminLink);
    platformNav.appendChild(adminItem);
  }

  async function renderSiteMenus(){
    const siteList=await fetchSiteConfigs();
    const grouped=groupSitesByPlatform(siteList);
    renderSelfOperatedMenu(grouped.ae_self_operated||[],grouped.ae_managed||[]);
    renderIndependentMenu(grouped.independent||[]);
    renderAdditionalPlatforms(grouped);
    highlightActivePlatformLink();
    return grouped;
  }

  async function initialize(){
    console.log('开始初始化站点菜单...');
    try{
      await renderSiteMenus();
    }catch(error){
      console.warn('站点菜单初始化失败，使用默认配置',error);
      renderSelfOperatedMenu([],[]);
      renderIndependentMenu([]);
    }
    applyNavIcons();
    updateCurrentSiteDisplay();
    ensureAdminLink();
    setupDropdownEvents();
    highlightActivePlatformLink();
    console.log('站点菜单初始化完成');
  }

  window.renderSiteMenus=renderSiteMenus;
  window.refreshSiteMenus=renderSiteMenus;
  window.updateCurrentSiteDisplay=updateCurrentSiteDisplay;

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initialize);
  }else{
    initialize();
  }
})();
