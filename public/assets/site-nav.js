(function(){
  function render(){
    const managedMenu=document.getElementById('managedMenu');
    if(managedMenu){
      let sites=JSON.parse(localStorage.getItem('managedSites')||'null');
      if(!Array.isArray(sites)||!sites.length){sites=['主站'];}
      const params=new URLSearchParams(location.search);
      const mode=params.get('mode');
      const linkPage=location.pathname.includes('self-operated')||mode==='self'?'self-operated.html':'index.html';
      managedMenu.innerHTML='<li><a href="index.html">全托管</a></li><li><a href="self-operated.html">自运营</a></li>';
      const currentKey='currentSite';
      sites.forEach(name=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href=linkPage;
        a.textContent=name;
        a.addEventListener('click',e=>{
          e.preventDefault();
          localStorage.setItem(currentKey,name);
          window.location.href=linkPage;
        });
        li.appendChild(a);
        managedMenu.appendChild(li);
      });
    }
    const indepMenu=document.getElementById('indepMenu');
    if(indepMenu){
      let sites=JSON.parse(localStorage.getItem('indepSites')||'null');
      if(!Array.isArray(sites)||!sites.length){sites=['独立站'];}
      indepMenu.innerHTML='';
      const currentKey='currentIndepSite';
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
    }
  }
  window.renderSiteMenus=render;
  document.addEventListener('DOMContentLoaded',render);
})();
