(function(){
  function markNumericCells(table){
    if(!table) return;
    table.querySelectorAll('tbody td').forEach(function(td){
      var text = td.textContent.trim().replace(/,/g,'');
      if(/^[-+]?\d+(?:\.\d+)?%?$/.test(text)){
        td.classList.add('num-cell');
      }
    });
  }
  window.addEventListener('DOMContentLoaded', function(){
    var table = document.querySelector('#report');
    if(table){
      markNumericCells(table);
      if(window.jQuery){
        jQuery(table).on('draw.dt', function(){
          markNumericCells(table);
        });
      }
    }
  });
})();
