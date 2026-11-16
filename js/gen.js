import { $, esc, toast, openOverlay, closeOverlay, confirmDialog, confetti, fanfare } from './ui.js';
import { api } from './config.js';
import { renderMaterial, wire, miniCelebrate, KIND_INFO } from './render.js';

const MAX_CHARS = 23500;
let onCountChange = () => {};

// ---------- IndexedDB ----------
const DB = 'baza-materialy', STORE = 'materials';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); });
}
const getAll = () => tx('readonly', s => s.getAll());
const putOne = m => tx('readwrite', s => s.put(m));
const delOne = id => tx('readwrite', s => s.delete(id));
let items = [];
export const materialsCount = () => items.length;

// ---------- generowanie ----------
const LOAD_MSGS = {
  instrukcja: ['Czytam Twoje notatki…', 'Szukam kolejnych kroków…', 'Numeruję jak w zeszycie…', 'Sprawdzam, czy niczego nie pominęłam…'],
  lekcja: ['Czytam Twoje notatki…', 'Układam lekcję w rozdziały…', 'Wymyślam pytania sprawdzające…', 'Dodaję szczyptę brokatu ✨'],
  prezentacja: ['Czytam Twoje notatki…', 'Kroję slajdy…', 'Wybieram najważniejsze punkty…', 'Polerujemy neony ✨'],
  fiszki: ['Czytam Twoje notatki…', 'Wycinam karteczki…', 'Piszę pytania z przodu…', 'Chowam odpowiedzi z tyłu 🤫'],
  test: ['Czytam Twoje notatki…', 'Wymyślam podchwytliwe pytania…', 'Chowam dobre odpowiedzi…', 'Szykuję puchar 🏆'],
};
let ctl = null, msgT = null;
function showLoading(kind, n) {
  const k = KIND_INFO[kind];
  $('#genLoadKind').textContent = `${k.ico} ${k.label}${n > 1 ? ` z ${n} notatek` : ''}`;
  const msgs = LOAD_MSGS[kind]; let i = 0; $('#genLoadMsg').textContent = msgs[0];
  clearInterval(msgT); msgT = setInterval(() => { i = (i + 1) % msgs.length; const el = $('#genLoadMsg'); el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); el.textContent = msgs[i]; }, 2300);
  openOverlay('genLoading', () => { clearInterval(msgT); ctl?.abort(); });
}
function hideLoading() { clearInterval(msgT); if (!$('#genLoading').hidden) { const c = ctl; ctl = null; closeOverlay(); ctl = c; } }

function friendlyError(code, message) {
  $('#genErrTitle').textContent = code === 'offline' ? 'Jesteś offline 📴' : code === 'budget' || code === 'quota' ? 'Skarbonka pusta 💸' : code === 'rate' ? 'Chwilka przerwy 🐌' : 'Ups, nie wyszło 🙈';
  $('#genErrText').textContent = message;
  openOverlay('genError');
}

export function sourcesFromDocs(docs) {
  return docs.map(d => ({
    title: d.title, source: d.src || '', url: d.url || '',
    text: d.k === 'l' ? [d.summary, d.url].filter(Boolean).join('\n') : (d.text || d.summary || ''),
  }));
}

export async function generate(kind, docs, title) {
  if (!navigator.onLine) return friendlyError('offline', 'Do robienia nowych materiałów potrzebuję internetu. Wyszukiwarka i zapisane materiały działają dalej bez sieci 🙂');
  const src = sourcesFromDocs(docs);
  const total = src.reduce((n, s) => n + s.text.length + s.title.length, 0);
  if (total > MAX_CHARS) return friendlyError('too_long', `To za dużo tekstu naraz (ok. ${Math.round(total / 1000)} tys. znaków). Odznacz kilka karteczek i spróbuj jeszcze raz.`);
  ctl = new AbortController();
  const myCtl = ctl;
  const timer = setTimeout(() => myCtl.abort(), 90000);
  showLoading(kind, docs.length);
  let res, data;
  try {
    res = await fetch(api() + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: myCtl.signal,
      body: JSON.stringify({ kind, title, sources: src.map(({ title, text, source }) => ({ title, text, source })) }) });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    clearTimeout(timer);
    if (myCtl.signal.aborted && $('#genLoading').hidden) return; // anulowała
    hideLoading();
    return friendlyError(navigator.onLine ? 'net' : 'offline', navigator.onLine ? 'Nie mogę się połączyć z AI. Sprawdź internet i spróbuj jeszcze raz za chwilkę.' : 'Zgubiłam internet po drodze 📴 Spróbuj, jak wróci sieć.');
  }
  clearTimeout(timer);
  if ($('#genLoading').hidden) return; // anulowano w międzyczasie
  hideLoading();
  if (!res.ok || !data.ok) return friendlyError(data.code, data.message || 'Coś poszło nie tak. Spróbuj jeszcze raz.');
  if (typeof data.remaining_usd === 'number') localStorage.setItem('baza-budget', JSON.stringify({ r: data.remaining_usd, t: Date.now() }));
  const m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, title: data.data?.title || docs[0].title, data: data.data,
    sources: src.map(s => ({ title: s.title, src: s.source, url: s.url })), createdAt: Date.now(), model: data.model, saved: false };
  openMaterial(m);
}

// ---------- podgląd materiału ----------
let current = null;
export function openMaterial(m) {
  current = m;
  const body = $('#genBody');
  body.innerHTML = renderMaterial(m);
  wire(body.firstElementChild, { onFinish: (good, total, el) => { if (good / total >= 0.5) { confetti(el); fanfare(); } } });
  $('#genKicker').textContent = KIND_INFO[m.kind].label + (m.sources.length > 1 ? ` · z ${m.sources.length} notatek` : '');
  updateSaveBtn();
  openOverlay('genView', () => { if (!current?.saved) askSave(current); current = null; });
  $('#genView .reader-sheet').scrollTop = 0;
}
function updateSaveBtn() {
  const b = $('#genSave'); b.textContent = current?.saved ? '✓ Zapisane' : '💾 Zapisz'; b.disabled = !!current?.saved; b.classList.toggle('done', !!current?.saved);
}
async function save(m) {
  m.saved = true; await putOne(m);
  items = [m, ...items.filter(x => x.id !== m.id)];
  renderList(); onCountChange();
}
async function askSave(m) {
  if (!m) return;
  await new Promise(r => setTimeout(r, 60));
  const yes = await confirmDialog('Zapisać ten materiał? 💾', 'Jeśli go nie zapiszesz, zniknie. Zapisane znajdziesz w zakładce Materiały – działają też bez internetu.', 'Zapisz', 'Nie, dzięki', 'primary');
  if (yes) { await save(m); toast('Zapisane w Moich materiałach 💾'); }
}
$('#genSave').addEventListener('click', async () => { if (!current || current.saved) return; await save(current); updateSaveBtn(); toast('Zapisane w Moich materiałach 💾'); });
$('#genDownload').addEventListener('click', async () => { if (!current) return; await download(current); if (!current.saved) toast('Pobrane 📥 Plik jest w Pobranych na telefonie'); else afterDownload(current, true); });
$('#genErrOk').addEventListener('click', () => closeOverlay());

// ---------- pobieranie (samodzielny plik HTML, działa offline) ----------
let fontCss = null;
async function fontFaces() {
  if (fontCss) return fontCss;
  const fonts = [['Baloo 2', 'Baloo2.woff2', '400 800'], ['Nunito', 'Nunito.woff2', '200 900'], ['Patrick Hand', 'PatrickHand-Regular.woff2', '400'], ['Luckiest Guy', 'LuckiestGuy-Regular.woff2', '400']];
  const parts = await Promise.all(fonts.map(async ([fam, file, w]) => {
    try {
      const b = await (await fetch('fonts/' + file)).blob();
      const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
      return `@font-face{font-family:"${fam}";src:url(${url}) format("woff2");font-weight:${w};font-display:swap}`;
    } catch { return ''; }
  }));
  return (fontCss = parts.join('\n'));
}
let genCss = null;
export async function buildHTML(m) {
  genCss ??= await (await fetch('css/gen.css')).text();
  const date = new Date(m.createdAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)} – Baza wiedzy AI</title>
<style>${await fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:radial-gradient(circle at 15% 0%,rgba(255,61,174,.18),transparent 40%),radial-gradient(circle at 90% 30%,rgba(60,239,255,.14),transparent 40%),#160e0c;padding:20px 14px 40px;font-family:"Nunito",system-ui,sans-serif}
.wrap{max-width:720px;margin:0 auto}
.brand{display:flex;align-items:center;gap:10px;color:#fff7eb;font-family:"Baloo 2",sans-serif;font-weight:800;font-size:17px;margin-bottom:12px}
.brand b{color:#3cefff}.brand small{display:block;font-family:"Patrick Hand",cursive;font-weight:400;font-size:14px;color:#f0d2a8}
.sheet{background:#fff7eb;border:2.5px solid #140c0a;border-radius:22px;padding:18px 16px 20px;box-shadow:5px 5px 0 #ff3dae}
.foot{color:#d9c4a8;text-align:center;font-family:"Patrick Hand",cursive;font-size:14px;margin-top:16px}
${genCss}</style></head><body><div class="wrap">
<div class="brand"><span style="font-size:30px">🙂</span><div>Baza wiedzy <b>AI</b><small>${esc(date)}</small></div></div>
<div class="sheet">${renderMaterial(m)}</div>
<div class="foot">Zrobione w Bazie wiedzy AI z notatek Magdy ✨</div></div>
<script>(${wire.toString()})(document.querySelector('.m-root'),{onFinish:${miniCelebrate.toString()}});</script>
</body></html>`;
}
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).toLowerCase() || 'material';
async function download(m) {
  try {
    const html = await buildHTML(m);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${KIND_INFO[m.kind].label.toLowerCase()}-${slug(m.title)}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch (e) { console.error(e); toast('Nie udało się pobrać pliku 🙈'); return false; }
}
async function afterDownload(m, fromViewer) {
  await new Promise(r => setTimeout(r, 400));
  const yes = await confirmDialog('Pobrane! 📥', `„${m.title}” jest już w Pobranych na telefonie i otworzy się nawet bez internetu. Usunąć go teraz z aplikacji?`, 'Usuń z aplikacji', 'Zostaw');
  if (yes) { await remove(m.id); toast('Usunięte z aplikacji – plik został w Pobranych 👍'); if (fromViewer && !$('#genView').hidden) { current = null; closeOverlay(); } }
}
async function remove(id) { await delOne(id); items = items.filter(x => x.id !== id); renderList(); onCountChange(); }

// ---------- lista „Moje materiały” ----------
function budgetNote() {
  try {
    const b = JSON.parse(localStorage.getItem('baza-budget') || 'null'); if (!b) return '';
    const n = Math.floor(b.r / 0.0015);
    return b.r <= 0.003 ? 'W tym miesiącu skarbonka na generowanie jest pusta 💸' : `W skarbonce zostało na ok. ${n} ${n === 1 ? 'materiał' : 'materiałów'} w tym miesiącu 💰`;
  } catch { return ''; }
}
async function refreshBudget() {
  if (!navigator.onLine) return;
  try { const r = await fetch(api() + '/status'); const j = await r.json(); if (j.ok) { localStorage.setItem('baza-budget', JSON.stringify({ r: j.remaining_usd, t: Date.now() })); const el = $('#matBudget'); if (el) el.textContent = budgetNote(); } } catch { }
}
const fmt = t => new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ', ' + new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
function renderList() {
  const box = $('#materials'); if (!box) return;
  box.innerHTML = `<div class="page-title"><h1>Moje materiały</h1><span class="sub">zrobione z Twoich notatek</span></div>
    <div class="mat-budget" id="matBudget">${esc(budgetNote())}</div>
    ${items.length ? items.map((m, i) => { const k = KIND_INFO[m.kind]; return `<article class="card mat-card" data-id="${m.id}" style="--card-accent:${k.color};animation-delay:${Math.min(i, 8) * 45}ms">
      <div class="kicker"><span class="pill mat-pill" style="background:${k.color}">${k.ico} ${k.label}</span><span class="rel">${esc(fmt(m.createdAt))}</span></div>
      <h2>${esc(m.title)}</h2>
      <p class="snippet">${esc(m.sources.map(s => s.title).join(' · '))}</p>
      <div class="foot"><div class="source"><span>${m.sources.length > 1 ? `z ${m.sources.length} notatek` : esc(m.sources[0]?.src || '')}</span></div>
        <div class="actions"><button class="btn primary" data-m="open">Otwórz</button><button class="btn" data-m="dl">Pobierz</button><button class="btn mat-del" data-m="del" aria-label="Usuń">🗑️</button></div></div>
    </article>`; }).join('') : `<div class="empty mat-empty"><div class="big-emoji">📚</div><div class="bubble"><h2>Tu jeszcze pusto!</h2><p>Wejdź w Szukaj, przytrzymaj palcem dowolną karteczkę i wybierz np. Fiszki albo Test. Gotowy materiał zapiszesz tutaj.</p></div></div>`}`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#materials [data-m]'); if (!b) return;
  const m = items.find(x => x.id === b.closest('[data-id]').dataset.id); if (!m) return;
  if (b.dataset.m === 'open') openMaterial(m);
  if (b.dataset.m === 'dl') { if (await download(m)) afterDownload(m); }
  if (b.dataset.m === 'del') { if (await confirmDialog('Usunąć materiał?', `„${m.title}” zniknie z aplikacji. Tego nie da się cofnąć.`)) { await remove(m.id); toast('Usunięte 🗑️'); } }
});

export async function initMaterials(cb) {
  onCountChange = cb || onCountChange;
  try { items = (await getAll()).sort((a, b) => b.createdAt - a.createdAt); } catch { items = []; }
  renderList(); onCountChange();
}
export function onMaterialsShown() { renderList(); refreshBudget(); }
