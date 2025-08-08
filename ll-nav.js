// ll-nav.js — load shared header and highlight current page
(function(){
  async function load(){
    try{
      const cont = document.getElementById('ll-header') || (function(){
        const d=document.createElement('div'); d.id='ll-header'; document.body.prepend(d); return d;
      })();
      const res = await fetch('./ll-header.html', {cache:'no-store'});
      const html = await res.text();
      cont.innerHTML = html;

      // Active state based on path
      const p = location.pathname.toLowerCase();
      const key = p.includes('today') ? 'today'
                : p.includes('progress') ? 'progress'
                : p.includes('camera') ? 'camera'
                : 'index';
      const a = cont.querySelector(`a[data-key="${key}"]`);
      if (a){ a.classList.add('active'); a.setAttribute('aria-current','page'); }
    }catch(e){ /* no-op */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
