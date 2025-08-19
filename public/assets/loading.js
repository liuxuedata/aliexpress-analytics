(function(){
  let count = 0;
  let timer = null;
  let progress = 0;

  function ensure(){
    let el = document.getElementById('globalLoading');
    if(!el){
      el = document.createElement('div');
      el.id = 'globalLoading';
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="loading-box"><div class="progress"><div class="bar"></div></div><div class="loading-text">努力加载中，请等待片刻。。。。</div></div>';
      document.body.appendChild(el);
    }
    return el;
  }

  function start(){
    const el = ensure();
    const bar = el.querySelector('.bar');
    progress = 0;
    bar.style.width = '0%';
    clearInterval(timer);
    timer = setInterval(()=>{
      progress = Math.min(progress + Math.random()*20, 90);
      bar.style.width = progress + '%';
    },300);
  }

  window.showLoading = function(){
    count++;
    const el = ensure();
    if(count === 1){
      el.style.display = 'flex';
      start();
    }
  };

  window.hideLoading = function(){
    count = Math.max(0, count-1);
    if(count===0){
      const el = ensure();
      const bar = el.querySelector('.bar');
      clearInterval(timer);
      bar.style.width = '100%';
      setTimeout(()=>{ el.style.display='none'; },300);
    }
  };
})();
