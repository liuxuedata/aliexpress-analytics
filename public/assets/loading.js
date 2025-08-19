(function(){
  let count = 0;
  function ensure(){
    let el = document.getElementById('globalLoading');
    if(!el){
      el = document.createElement('div');
      el.id = 'globalLoading';
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  window.showLoading = function(){
    count++;
    const el = ensure();
    el.style.display = 'flex';
  };
  window.hideLoading = function(){
    count = Math.max(0, count-1);
    if(count===0){
      const el = document.getElementById('globalLoading');
      if(el) el.style.display = 'none';
    }
  };
})();
