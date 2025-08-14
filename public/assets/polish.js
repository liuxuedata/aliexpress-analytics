
// codex-polish-kit v1.0
// Light/Dark toggle + simple sticky header shadow + KPI equal heights
(function(){
  const root = document.documentElement;
  const btn = document.querySelector('[data-action="toggle-theme"]');
  const current = localStorage.getItem('theme');
  if(current){ root.setAttribute('data-theme', current); }
  if(btn){
    btn.addEventListener('click', ()=>{
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
  const navbar = document.querySelector('.navbar');
  if(navbar){
    const onScroll = () => {
      navbar.style.boxShadow = (window.scrollY>8) ? 'var(--shadow-sm)' : 'none';
    };
    document.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
  }
  // Normalize KPI heights
  const kpis = document.querySelectorAll('.kpi');
  if(kpis.length){
    const max = Math.max(...Array.from(kpis).map(el=>el.offsetHeight));
    kpis.forEach(el=>{ el.style.minHeight = max + 'px'; });
  }
})();
