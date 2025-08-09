// ====== Config ======
const DEEPL_PROXY = "https://deepl-proxy.8p8kxkrcnj.workers.dev";
const SYNC_BASE   = "https://lingualab-sync.8p8kxkrcnj.workers.dev";

// ====== Helpers ======
function normLang(x){
  if (!x) return "auto";
  const s = String(x).toLowerCase();
  if (s === "auto") return "auto";
  if (s.startsWith("nl")) return "NL";
  if (s.startsWith("en")) return "EN";
  if (["pt","pt-br","pt_br","ptbr","br"].includes(s)) return "PT-BR";
  return s.toUpperCase();
}

// Providers
const ENDPOINTS = [
  { name:'DeepL (Cloudflare)', type:'deepl', base: DEEPL_PROXY },
  { name:'LibreTranslate .com', type:'libre', base:'https://libretranslate.com' },
  { name:'LibreTranslate .de',  type:'libre', base:'https://libretranslate.de' },
  { name:'LibreTranslate astian', type:'libre', base:'https://translate.astian.org' },
  { name:'LibreTranslate fyed', type:'libre', base:'https://translate.fyed.xyz' },
  { name:'CORS proxy .com', type:'libre-proxy', base:'https://cors.isomorphic-git.org/https://libretranslate.com' },
  { name:'CORS proxy .de',  type:'libre-proxy', base:'https://cors.isomorphic-git.org/https://libretranslate.de' },
  { name:'MyMemory', type:'mymemory', base:'https://api.mymemory.translated.net' }
];

// DOM
const statusEl  = document.getElementById('status');
const inputEl   = document.getElementById('input');
const outputEl  = document.getElementById('output');
const analysisEl= document.getElementById('analysis');
const notesEl   = document.getElementById('notes');
const sourceEl  = document.getElementById('source');
const targetEl  = document.getElementById('target');
const cariocaEl = document.getElementById('carioca');

// ====== Sync (UID, save, load) ======
function getUID(){
  let id = localStorage.getItem('ll_uid');
  if (!id) { id = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('ll_uid', id); }
  return id;
}
async function syncSave(key, value){
  try{
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    const res = await fetch(`${SYNC_BASE}/save`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ uid:getUID(), key, value:payload })
    });
    return res.ok;
  } catch { return false; }
}
async function syncLoad(key){
  try{
    const url = `${SYNC_BASE}/get?uid=${encodeURIComponent(getUID())}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.value ?? null;
  } catch { return null; }
}

// ====== Favorieten + SRS (met sync) ======
const FKEY = 'll_favs_v1';
function getFavs(){ try { return JSON.parse(localStorage.getItem(FKEY)) || []; } catch { return []; } }
function setFavs(f){
  const data = JSON.stringify(f||[]);
  localStorage.setItem(FKEY, data);
  syncSave(FKEY, data);
}
const SRS_KEY = (() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/^ll_srs_/i.test(k)) return k;
  }
  return 'll_srs_v1';
})();
function getSrsDeck(){ try { return JSON.parse(localStorage.getItem(SRS_KEY)) || []; } catch { return []; } }
function setSrsDeck(deck){
  const data = JSON.stringify(deck || []);
  localStorage.setItem(SRS_KEY, data);
  syncSave(SRS_KEY, data);
}

// ====== Utils ======
async function copyText(text){
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true;
  } catch { return false; }
}
async function shareText(title, text){
  try { if (navigator.share) { await navigator.share({title, text}); return true; } } catch {}
  return false;
}
async function callJSON(url, body){
  const ctrl = new AbortController();
  const resP = fetch(url, { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(body), signal:ctrl.signal });
  const t = setTimeout(()=>ctrl.abort(), 12000);
  try {
    const res = await resP;
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } finally { clearTimeout(t); }
}
async function detectLangAuto(q, base, type){
  if (type.startsWith('libre')) {
    try {
      const data = await callJSON(base + '/detect', { q });
      if (Array.isArray(data) && data.length) {
        const best = data.sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0];
        return best.language || 'en';
      }
    } catch(e){}
  }
  const t = q.toLowerCase();
  if (/[ãõçáéíóúâêô]/u.test(t) || /você|tô|tá|cadê|grana|a gente/u.test(t)) return 'pt';
  if (/(^|\b)(het|de|een|ik|jij|wij|jullie|niet)(\b|$)/u.test(t)) return 'nl';
  return 'en';
}

// ====== Vertalers ======
async function translateProvider(q, src, dst, provider){
  if (provider.type === 'deepl') {
    const res = await fetch(provider.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text:q, source_lang:normLang(src), target_lang:normLang(dst) })
    });
    if (!res.ok) throw new Error('DeepL HTTP ' + res.status);
    const data = await res.json();
    const out = data?.text || data?.translations?.[0]?.text;
    if (!out) throw new Error('Geen vertaling ontvangen van DeepL');
    return out;
  }
  if (provider.type==='libre' || provider.type==='libre-proxy'){
    let source = src;
    if (source==='auto') source = await detectLangAuto(q, provider.base, provider.type);
    const data = await callJSON(provider.base + '/translate', { q, source, target: dst, format:'text' });
    return data.translatedText || data;
  }
  // MyMemory
  let source = src;
  if (source==='auto') source = await detectLangAuto(q, provider.base, 'heuristic');
  const url = provider.base + '/get?q=' + encodeURIComponent(q) + '&langpair=' + source + '|' + dst;
  const r = await fetch(url); const j = await r.json();
  if (j?.responseStatus !== 200) throw new Error('MyMemory ' + (j?.responseStatus||'err'));
  return j?.responseData?.translatedText || '';
}
async function translateWithChain(q, src, dst){
  let lastErr = null;
  for (const p of ENDPOINTS){
    try {
      statusEl.textContent = 'Proberen via ' + p.name + '…';
      const text = await translateProvider(q, src, dst, p);
      return { text, provider: p.name };
    } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('Geen provider beschikbaar');
}

// ====== Slang aanpassingen ======
const slangRules = [
  {from:/\bvocê está\b/gi, to:'cê tá'},
  {from:/\bestá\b/gi, to:'tá'},
  {from:/\bvocê\b/gi, to:'cê'},
  {from:/\bestou\b/gi, to:'tô'},
  {from:/\bpara o\b/gi, to:'pro'},
  {from:/\bpara a\b/gi, to:'pra'}
];
function applyCarioca(pt){ let out=pt; slangRules.forEach(r=>out=out.replace(r.from,r.to)); return out; }

// ====== Tokenizer + analyse ======
let WORD_RE;
(function(){
  try {
    WORD_RE = new RegExp("\\p{L}+|\\d+|[^\\s\\p{L}\\d]", "gu");
    const test = "coração".match(WORD_RE);
    if (!test || test.length === 0) throw new Error("bad");
  } catch (e) {
    WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+|\d+|[^\sA-Za-zÀ-ÖØ-öø-ÿ\d]/g;
  }
})();
function tokenizeUnicode(s){ return s.match(WORD_RE) || []; }

const pronouns = { nl:['ik','jij','je','u','hij','zij','ze','wij','we','jullie','zij'],
                   en:['i','you','he','she','we','they'],
                   pt:['eu','você','ele','ela','a','gente','nós','vocês','eles','elas'] };
const preps = { nl:['in','op','aan','met','voor','na','bij','naar','van','tot','onder','boven','tijdens','zonder','tegen','rond','door','over','uit'],
                en:['in','on','at','to','for','from','with','by','about','over','under','between','without','during','against','through'],
                pt:['em','no','na','num','numa','com','para','pra','pro','de','do','da','dos','das','por','sem','entre','sobre','até','a'] };
const clauseMarkers = { nl:['dat','omdat','als','terwijl','wanneer','zodat','hoewel','die','waar','toen'],
                        en:['that','because','if','while','when','so','although','who','which','where'],
                        pt:['que','porque','se','enquanto','quando','para','embora','quem','onde'] };

function analyzeSentence(sentence, lang){
  const words = tokenizeUnicode(sentence);
  const tags = [];
  const lower = words.map(w=>w.toLowerCase());

  const subjSet = new Set(pronouns[lang]||[]);
  for (let i=0;i<lower.length;i++){ if (subjSet.has(lower[i])) { tags.push({i,type:'subj'}); break; } }

  const prepSet = new Set(preps[lang]||[]);
  for (let i=0;i<lower.length;i++){ if (prepSet.has(lower[i])) tags.push({i,type:'prep'}); }

  const cm = new Set(clauseMarkers[lang]||[]);
  for (let i=0;i<lower.length;i++){ if (cm.has(lower[i])) tags.push({i,type:'clause'}); }

  for (let i=0;i<lower.length;i++){
    const w = lower[i];
    if ((lang==='en' && (/ing$|ed$|\w+s$/i.test(w))) ||
        (lang==='nl' && (/^ge\w+/i.test(w))) ||
        (lang==='pt' && (/(ei|ou|aram|ava|ia|amos|em|am|ou)$/i.test(w)))) {
      tags.push({i,type:'verb'});
    }
  }
  return { words, tags };
}
function renderTags(container, analysis){
  const { words, tags } = analysis;
  const map = new Map();
  tags.forEach(t=>{ if(!map.has(t.i)) map.set(t.i,[]); map.get(t.i).push(t.type); });
  container.innerHTML = '';
  for (let i=0;i<words.length;i++){
    const tok = words[i];
    const types = map.get(i) || [];
    if (types.length){
      const span = document.createElement('span');
      span.textContent = tok;
      span.className = 'pill ' + types.join(' ');
      span.dataset.types = types.join(',');
      container.appendChild(span);
    } else {
      container.appendChild(document.createTextNode(tok));
    }
    container.appendChild(document.createTextNode(' '));
  }
}

// ====== UI actions ======
document.getElementById('btnTranslate').addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) { alert('Voer eerst een zin in.'); return; }
  const src = sourceEl.value; const dst = targetEl.value;

  statusEl.textContent = navigator.onLine ? 'Vertalen…' : 'Je bent offline — kan mislukken.';
  outputEl.textContent = ''; analysisEl.textContent=''; notesEl.textContent='';

  try {
    let { text: translated, provider } = await translateWithChain(text, src, dst);
    if (dst==='pt' && cariocaEl.checked) translated = applyCarioca(translated);
    outputEl.textContent = `▶ Vertaling (${dst}) via ${provider}:\n` + translated;

    const analysis = analyzeSentence(translated, dst);
    renderTags(analysisEl, analysis);
    notesEl.textContent = (dst==='pt' && cariocaEl.checked) ? '🎧 Slang-modus: para→pra/pro, você está→cê tá, estou→tô.' : '';

    outputEl.dataset.last = translated;
    outputEl.dataset.meta = JSON.stringify({src, dst, input:text});
    statusEl.textContent = 'Klaar.';
  } catch (err) {
    statusEl.textContent = 'Kon niet vertalen.';
    outputEl.textContent = 'Fout: ' + (err?.message || 'onbekend');
  }
});

document.getElementById('btnSwap').addEventListener('click', () => {
  const s = sourceEl.value; const t = targetEl.value;
  if (s === 'auto') { alert('Bron op “auto” kan niet worden gewisseld. Kies eerst een bron.'); return; }
  sourceEl.value = t; targetEl.value = s;
});
document.getElementById('btnClear').addEventListener('click', () => {
  inputEl.value=''; outputEl.textContent='Klaar voor input…'; analysisEl.textContent=''; notesEl.textContent=''; statusEl.textContent='';
});
document.getElementById('btnCopy').addEventListener('click', async () => {
  const txt = outputEl.dataset.last || ''; if (!txt) { alert('Nog geen vertaling.'); return; }
  const ok = await copyText(txt); statusEl.textContent = ok ? 'Gekopieerd.' : 'Kopiëren mislukt.';
});
document.getElementById('btnShare').addEventListener('click', async () => {
  const txt = outputEl.dataset.last || ''; if (!txt) { alert('Nog geen vertaling.'); return; }
  const ok = await shareText('LinguaLab – vertaling', txt); statusEl.textContent = ok ? 'Deelvenster geopend.' : 'Delen niet ondersteund.';
});
function speak(text, lang){
  try { const u = new SpeechSynthesisUtterance(text); u.lang = lang==='pt' ? 'pt-BR' : (lang==='nl' ? 'nl-NL' : 'en-US'); speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch { return false; }
}
document.getElementById('btnSpeak').addEventListener('click', () => {
  const txt = outputEl.dataset.last || ''; if (!txt) { alert('Nog geen vertaling.'); return; }
  const ok = speak(txt, targetEl.value); statusEl.textContent = ok ? 'Voorlezen…' : 'Voorlezen niet ondersteund.';
});

// Favorieten + SRS 2.0 add
document.getElementById('btnSaveFav').addEventListener('click', () => {
  const txt = outputEl.dataset.last || ''; if (!txt) { alert('Nog geen vertaling om te bewaren.'); return; }
  const meta = JSON.parse(outputEl.dataset.meta || '{}');
  const favs = getFavs(); favs.unshift({ ts: Date.now(), input: meta.input||'', src: meta.src||'', dst: meta.dst||'', out: txt });
  setFavs(favs.slice(0,200)); statusEl.textContent = '⭐ Bewaard.';
});
document.getElementById('btnSaveCard').addEventListener('click', async ()=>{
  const txt = outputEl.dataset.last || ''; if (!txt) { alert('Nog geen vertaling.'); return; }
  const meta = JSON.parse(outputEl.dataset.meta || '{}');
  const res = await LL_SRS.add(meta.input||'', txt, meta.src||'auto', meta.dst||'pt', ['manual']);
  if (res.ok) {
    statusEl.textContent = '📚 Toegevoegd aan SRS.';
    setSrsDeck(getSrsDeck()); // sync deck
  } else {
    statusEl.textContent = 'Kaart bestond al.';
  }
});

// Install tip
(function(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!isStandalone) document.getElementById('installTip').style.display = 'inline-flex';
})();

// Pull vanaf KV bij opstart
(async () => {
  const remoteFavs = await syncLoad(FKEY);
  if (remoteFavs) {
    try {
      const arr = JSON.parse(remoteFavs);
      if (Array.isArray(arr)) localStorage.setItem(FKEY, JSON.stringify(arr));
    } catch {}
  }
})();
(async () => {
  const remoteDeck = await syncLoad(SRS_KEY);
  if (remoteDeck) {
    try {
      const arr = JSON.parse(remoteDeck);
      if (Array.isArray(arr)) localStorage.setItem(SRS_KEY, JSON.stringify(arr));
    } catch {}
  }
})();
