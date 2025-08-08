// SRS 2.0 — IndexedDB + helpers
;(function(){
  const DB_NAME = 'lingualab';
  const DB_VERSION = 1;
  const STORE = 'cards';
  const META = 'meta';

  function openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e)=>{
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)){
          const store = db.createObjectStore(STORE, { keyPath:'id' });
          store.createIndex('due','due',{unique:false});
          store.createIndex('created','created',{unique:false});
        }
        if (!db.objectStoreNames.contains(META)){
          db.createObjectStore(META);
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  function tx(db, name, mode='readonly'){ return db.transaction(name, mode).objectStore(name); }

  async function get(db, store, key){
    return new Promise((resolve, reject)=>{
      const r = tx(db, store, 'readonly').get(key);
      r.onsuccess = ()=> resolve(r.result);
      r.onerror = ()=> reject(r.error);
    });
  }
  async function set(db, store, value){
    return new Promise((resolve, reject)=>{
      const r = tx(db, store, 'readwrite').put(value);
      r.onsuccess = ()=> resolve(true);
      r.onerror = ()=> reject(r.error);
    });
  }
  async function del(db, store, key){
    return new Promise((resolve, reject)=>{
      const r = tx(db, store, 'readwrite').delete(key);
      r.onsuccess = ()=> resolve(true);
      r.onerror = ()=> reject(r.error);
    });
  }
  async function allDue(db, limit=1000){
    return new Promise((resolve, reject)=>{
      const res = [];
      const idx = tx(db, STORE).index('due');
      const now = Date.now();
      const range = IDBKeyRange.upperBound(now);
      const req = idx.openCursor(range);
      req.onsuccess = (e)=>{
        const cur = e.target.result;
        if (cur && res.length < limit){ res.push(cur.value); cur.continue(); }
        else resolve(res);
      };
      req.onerror = ()=> reject(req.error);
    });
  }
  async function countAll(db){
    return new Promise((resolve, reject)=>{
      const r = tx(db, STORE).count();
      r.onsuccess = ()=> resolve(r.result||0);
      r.onerror = ()=> reject(r.error);
    });
  }

  function makeId(front, src, dst){
    try { return ('id_'+btoa(unescape(encodeURIComponent((front||'').slice(0,160)+src+dst)))).replace(/=+$/,''); }
    catch{ return 'id_'+Math.random().toString(36).slice(2); }
  }

  // SM-2 simplified
  function schedule(card, q){
    let EF = card.ef ?? 2.5, I = card.int ?? 0, R = card.rep ?? 0;
    const now = Date.now();
    if (q < 3) { R = 0; I = 1; }
    else {
      EF = Math.max(1.3, EF + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      if (R === 0) I = 1;
      else if (R === 1) I = 6;
      else I = Math.round(I * EF);
      R += 1;
    }
    card.ef = EF; card.int = I; card.rep = R; card.due = now + I*24*60*60*1000;
    (card.history ||= []).push({ts: now, q});
    return card;
  }

  function normalize(s){
    try{ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
    catch{ return (s||'').toString().toLowerCase().trim(); }
  }
  function dist(a,b){ // Levenshtein distance (small strings)
    a = normalize(a); b = normalize(b);
    const m = a.length, n = b.length;
    const dp = Array.from({length:m+1}, (_,i)=>Array(n+1).fill(0));
    for (let i=0;i<=m;i++) dp[i][0]=i;
    for (let j=0;j<=n;j++) dp[0][j]=j;
    for (let i=1;i<=m;i++){
      for (let j=1;j<=n;j++){
        const cost = a[i-1]===b[j-1]?0:1;
        dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
      }
    }
    return dp[m][n];
  }

  async function migrateFromLocalStorage(db){
    try{
      const raw = localStorage.getItem('ll_srs_v1');
      if (!raw) return 0;
      const arr = JSON.parse(raw)||[];
      let count=0;
      for (const c of arr){
        const id = c.id || makeId(c.front, c.src, c.dst);
        const exists = await get(db, STORE, id);
        if (exists) continue;
        const card = { id, front: c.front||'', back: c.back||'', src: c.src||'auto', dst: c.dst||'pt',
          tags: ['legacy'], created: Date.now(), ef: c.ef||2.5, rep: c.rep||0, int: c.int||0,
          due: c.due || Date.now(), history: [] };
        await set(db, STORE, card); count++;
      }
      // Optional: keep LS as backup
      return count;
    }catch{ return 0; }
  }

  const SRS = {
    async add(front, back, src='auto', dst='pt', tags=[]){
      const db = await openDB();
      const id = makeId(front, src, dst);
      const exists = await get(db, STORE, id);
      if (exists) return {ok:false, reason:'exists', id};
      const now = Date.now();
      const card = { id, front, back, src, dst, tags: Array.from(new Set(tags||[])), created: now, ef:2.5, rep:0, int:0, due: now, history:[] };
      await set(db, STORE, card);
      return {ok:true, id};
    },
    async grade(id, q){
      const db = await openDB();
      const card = await get(db, STORE, id);
      if (!card) return {ok:false};
      schedule(card, q);
      await set(db, STORE, card);
      return {ok:true, card};
    },
    async due(limit=50){ const db = await openDB(); return await allDue(db, limit); },
    async count(){ const db = await openDB(); return await countAll(db); },
    async get(id){ const db = await openDB(); return await get(db, STORE, id); },
    async update(card){ const db = await openDB(); await set(db, STORE, card); return {ok:true}; },
    async remove(id){ const db = await openDB(); await del(db, STORE, id); return {ok:true}; },
    async migrate(){ const db = await openDB(); return await migrateFromLocalStorage(db); },
    util: { normalize, dist }
  };

  window.LL_SRS = SRS;
})();