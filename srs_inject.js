// (Optioneel) Losse inject: voegt '📚 Oefenen' toe en haakt '⭐ Bewaar'.
// Niet nodig voor index_pro_full.html (die heeft dit al), wel handig als je oude index houdt.
(function(){
  const FKEY='ll_srs_v1';
  function getDeck(){ try{return JSON.parse(localStorage.getItem(FKEY))||[];}catch{return [];} }
  function setDeck(d){ localStorage.setItem(FKEY, JSON.stringify(d||[])); }
  function addCard(front, back, src, dst){
    const id=('id_'+btoa(unescape(encodeURIComponent(front.slice(0,120)+src+dst)))).replace(/=+$/,'');
    const deck=getDeck(); if(deck.some(c=>c.id===id)) return false;
    deck.push({id,front,back,src,dst,ef:2.5,rep:0,int:0,due:Date.now()}); setDeck(deck); return true;
  }
  function ensureButton(){
    const actions=document.querySelector('.actions'); if(!actions) return;
    let btn=document.getElementById('btnSaveCard');
    if(!btn){
      btn=document.createElement('button'); btn.id='btnSaveCard'; btn.className='btn inline'; btn.textContent='📚 Oefenen';
      actions.appendChild(btn);
    }
    btn.addEventListener('click', ()=>{
      const out=document.getElementById('output'); if(!out||!out.dataset||!out.dataset.last){ alert('Nog geen vertaling.'); return; }
      const meta=JSON.parse(out.dataset.meta||'{}'); const ok=addCard(meta.input||'', out.dataset.last, meta.src||'auto', meta.dst||'pt');
      alert(ok ? 'Toegevoegd aan oefenen.' : 'Kaart bestaat al.');
    });
    const fav=document.getElementById('btnSaveFav');
    if(fav && !fav.dataset.srsHooked){
      fav.dataset.srsHooked='1';
      fav.addEventListener('click', ()=>{
        const out=document.getElementById('output'); if(!out||!out.dataset||!out.dataset.last) return;
        const meta=JSON.parse(out.dataset.meta||'{}'); addCard(meta.input||'', out.dataset.last, meta.src||'auto', meta.dst||'pt');
      });
    }
  }
  document.addEventListener('DOMContentLoaded', ensureButton);
})();
