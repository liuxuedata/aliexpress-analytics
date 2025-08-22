(async function(){
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
        const sites=Array.from(new Set((j.sites||[]).filter(Boolean)));
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
  }
  window.renderSiteMenus=render;
  document.addEventListener('DOMContentLoaded',render);
})();
