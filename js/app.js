import { $, esc, toast, openOverlay, closeOverlay, longPress } from './ui.js';
import { state, loadData, startModel, search, tokens } from './search.js';
import { stem } from './search-core.js';
import { initIdeas, ideasSummary } from './ideas.js';
import { initBadges, badgesCount } from './badges.js';
import { generate, initMaterials, materialsCount, onMaterialsShown } from './gen.js';

// ---------- helpers ----------
const TYPES = {
  'notatka kursowa': ['t-notatka', 'Notatka z kursu'], 'moja baza wiedzy': ['t-baza', 'Moja baza'],
  'moje przemyślenia': ['t-mysli', 'Przemyślenia'], 'skill (tłumaczenie PL)': ['t-skill', 'Skill · PL'],
  'skill (oryginał EN)': ['t-skill', 'Skill · EN'], 'do zeszytu': ['t-zeszyt', 'Do zeszytu'],
  'ściąga': ['t-sciaga', 'Ściąga'], 'mój kurs GPT-6': ['t-kurs', 'Kurs GPT-6'], 'opowieść do snu': ['t-sen', 'Do snu'],
  'opracowanie kursu': ['t-notatka', 'Opracowanie'], 'artykuł / analiza': ['t-inne', 'Artykuł'],
  'transkrypcja kursu': ['t-notatka', 'Transkrypcja'], 'instrukcja do przetestowania': ['t-inne', 'Instrukcja'],
  'lista linków': ['t-link', 'Linki'], 'link': ['t-link', 'Link'],
};
const typeOf = t => TYPES[t] || ['t-inne', t || 'Notatka'];
const ACCENTS = ['accent-magenta', 'accent-cyan', 'accent-acid'];
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}
const FILE_SVG = '<svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M2 1.2h5l3 3V12.8H2V1.2z" stroke="currentColor" stroke-width="1.2"/><path d="M7 1.2v3h3" stroke="currentColor" stroke-width="1.2"/></svg>';
const LINK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

// ---------- routing ----------
const VIEWS = ['szukaj', 'pomysly', 'odznaki', 'materialy'];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'szukaj';
  for (const x of VIEWS) $('#view-' + x).hidden = x !== v;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === v));
  $('#app').dataset.view = v;
  if (v !== 'szukaj') exitSelect();
  if (v === 'materialy') onMaterialsShown();
  updateChip(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; updateChip(); });
export function updateChip() {
  const chip = $('#topChip'), v = $('#app').dataset.view;
  chip.classList.remove('install');
  if (v === 'pomysly') chip.textContent = ideasSummary();
  else if (v === 'odznaki') { const n = badgesCount(); chip.textContent = `${n} ${plural(n, 'sztuka', 'sztuki', 'sztuk')}`; }
  else if (v === 'materialy') { const n = materialsCount(); chip.textContent = `${n} ${plural(n, 'sztuka', 'sztuki', 'sztuk')}`; }
  else if (installEvt) { chip.textContent = 'Zainstaluj'; chip.classList.add('install'); }
  else chip.textContent = 'PWA';
}
$('#topChip').addEventListener('click', async () => {
  if (installEvt && $('#app').dataset.view === 'szukaj') { installEvt.prompt(); await installEvt.userChoice; installEvt = null; updateChip(); }
});

// ---------- search UI ----------
const res = $('#results'), qEl = $('#q');
let lastQuery = '', lastResults = [], shown = 10, selectMode = false; const selected = new Set();
let searchSeq = 0;

function cardHTML(r, n) {
  const d = r.doc, [cls, label] = typeOf(d.type);
  const isLink = d.k === 'l';
  const sel = selected.has(d.id);
  return `<article class="card ${ACCENTS[n % 3]}${selectMode ? ' selectable' : ''}${sel ? ' selected' : ''}" data-id="${esc(d.id)}" style="animation-delay:${Math.min(n, 8) * 45}ms">
    <span class="check" aria-hidden="true"></span>
    <div class="kicker"><span class="pill ${cls}">${esc(label)}</span></div>
    <h2>${esc(d.title)}</h2>
    <p class="snippet">${esc(d.summary)}</p>
    ${d.tags?.length ? `<div class="tags">${d.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="foot">
      <div class="source">${isLink ? LINK_SVG : FILE_SVG}<span>${esc(isLink ? (d.domain || '') + ' · z: ' + d.src : d.src)}</span></div>
      <div class="actions">
        <button class="btn primary" data-act="open">Otwórz</button>
        ${d.url ? `<a class="btn" data-act="orig" href="${esc(d.url)}" target="_blank" rel="noopener">Oryginał</a>` : ''}
      </div>
    </div>
  </article>`;
}

const EMPTY_MSGS = [
  ['Ojej, tu pusto jak bez lampek.', 'Przeszukałam Twoje notatki i nic nie mrugnęło. To hasło jeszcze się tu nie wprowadziło — spróbuj inaczej albo zerknij do zeszytu.'],
  ['Nawet halucynacja by tu nic nie wymyśliła.', 'Przekopałam wszystko, serio. Może to temat na nowy pomysł? Dopisz go w zakładce Pomysły, zanim ucieknie.'],
  ['Kwiatek szuka, kwiatek nie znajduje.', 'Tego jeszcze nie notowałaś. Spróbuj innym słowem albo prościej — ja tu poczekam z lupą.'],
  ['Zero wyników, sto procent uroku.', 'Twoje notatki milczą jak model bez kontekstu. Kliknij któryś temat poniżej i ruszamy dalej.'],
];
const MASCOT = `<svg class="mascot" viewBox="0 0 220 175" role="img" aria-label="Zdziwiona doniczka w neonowych okularach szuka w notatkach"><ellipse cx="110" cy="162" rx="58" ry="8" fill="#000" opacity=".25"/><path d="M72 108 L80 158 Q110 168 140 158 L148 108 Z" fill="#c45a32" stroke="#140c0a" stroke-width="2.4" stroke-linejoin="round"/><path d="M80 128 Q110 136 140 128" stroke="#8a3418" stroke-width="1.5" fill="none" opacity=".5"/><path d="M68 96 H152 L148 108 H72 Z" fill="#e07a48" stroke="#140c0a" stroke-width="2.4" stroke-linejoin="round"/><path d="M74 96 L70 88 H150 L146 96" fill="#d9a07a" stroke="#140c0a" stroke-width="2" stroke-linejoin="round"/><ellipse cx="110" cy="96" rx="36" ry="7" fill="#3a2418"/><path d="M110 96 C108 70, 86 52, 64 58 C72 78, 92 84, 110 96Z" fill="#2f6b3a" stroke="#140c0a" stroke-width="2"/><path d="M110 96 C100 68, 70 44, 48 54 C62 76, 88 86, 110 96Z" fill="#3f8a48" stroke="#140c0a" stroke-width="2"/><path d="M110 96 C112 66, 136 48, 158 58 C148 78, 128 84, 110 96Z" fill="#3f8a48" stroke="#140c0a" stroke-width="2"/><path d="M110 96 C120 64, 154 42, 176 56 C160 78, 132 88, 110 96Z" fill="#246332" stroke="#140c0a" stroke-width="2"/><path d="M110 96 C110 60, 118 34, 110 18 C96 36, 100 70, 110 96Z" fill="#4ea056" stroke="#140c0a" stroke-width="2"/><ellipse cx="110" cy="78" rx="28" ry="26" fill="#5ebd66" stroke="#140c0a" stroke-width="2.2"/><ellipse cx="94" cy="84" rx="5" ry="3" fill="#ff8ad4" opacity=".7"/><ellipse cx="126" cy="84" rx="5" ry="3" fill="#ff8ad4" opacity=".7"/><rect x="86" y="70" width="20" height="13" rx="4" fill="#1a1030" stroke="#3cefff" stroke-width="2"/><rect x="114" y="70" width="20" height="13" rx="4" fill="#1a1030" stroke="#ff3dae" stroke-width="2"/><path d="M106 75 H114" stroke="#140c0a" stroke-width="2.2" stroke-linecap="round"/><path d="M86 76 H80" stroke="#140c0a" stroke-width="2" stroke-linecap="round"/><path d="M134 76 H140" stroke="#140c0a" stroke-width="2" stroke-linecap="round"/><path d="M90 73 L102 76" stroke="#3cefff" stroke-width="1.2" opacity=".8"/><path d="M118 73 L130 76" stroke="#ff3dae" stroke-width="1.2" opacity=".8"/><path d="M102 92 Q110 88 118 92" stroke="#140c0a" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="78" cy="48" r="4" fill="#ffe9b8" stroke="#140c0a" stroke-width="1.2"/><circle cx="142" cy="44" r="4.2" fill="#ffd789" stroke="#140c0a" stroke-width="1.2"/><circle cx="118" cy="28" r="3.6" fill="#ffe9b8" stroke="#140c0a" stroke-width="1.2"/><path d="M78 48 C 96 36, 110 40, 118 28 S 132 36, 142 44" stroke="#3a2a18" stroke-width="1.3" fill="none"/><g transform="translate(158,96) rotate(18)"><circle cx="0" cy="0" r="16" fill="#e9fbff" fill-opacity=".82" stroke="#140c0a" stroke-width="3"/><circle cx="0" cy="0" r="16" stroke="#3cefff" stroke-width="1.5" fill="none"/><path d="M-7 -7 Q -3 -11, 5 -5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M12 12 L28 28" stroke="#140c0a" stroke-width="5" stroke-linecap="round"/><path d="M12 12 L28 28" stroke="#c6ff3a" stroke-width="2" stroke-linecap="round"/></g><text x="42" y="70" font-family="Baloo 2, Nunito, sans-serif" font-weight="800" font-size="22" fill="#c6ff3a" stroke="#140c0a" stroke-width="3" paint-order="stroke">?</text><text x="28" y="96" font-family="Baloo 2, Nunito, sans-serif" font-weight="800" font-size="16" fill="#ff3dae" stroke="#140c0a" stroke-width="3" paint-order="stroke">?</text></svg>`;
const HINTS = ['prompty', 'agenci', 'halucynacje', 'Deep Research', 'Streamlit', 'NotebookLM'];
const hintsHTML = (list) => list.map(h => `<button class="hint-chip" data-q="${esc(h)}">${esc(h)}</button>`).join('');
let emptyIdx = Math.floor(Math.random() * EMPTY_MSGS.length);

function renderHome() {
  const files = new Set(state.docs.map(d => d.src)).size;
  const chunks = state.docs.filter(d => d.k === 'c'), links = state.docs.length - chunks.length;
  const rnd = chunks[Math.floor(Math.random() * chunks.length)];
  res.innerHTML = `
    <div class="welcome"><div class="bubble"><h2>Cześć, Magda! O czym dziś poczytasz?</h2>
      <p>Wpisz pytanie po swojemu — szukam po znaczeniu, nie tylko po słowach. Wszystko dzieje się w Twoim telefonie, bez internetu.</p></div></div>
    <div class="chips">${hintsHTML(HINTS)}</div>
    <div class="stats"><div class="stat"><b>${chunks.length}</b><span>fragmentów</span></div><div class="stat"><b>${links}</b><span>linków</span></div><div class="stat"><b>${files}</b><span>plików</span></div></div>
    <div class="section-mini">Losowa karteczka z zeszytu <span class="bar"></span><button class="link-btn" id="anotherRnd">inna</button></div>
    ${rnd ? cardHTML({ doc: rnd }, 0) : ''}`;
  $('#anotherRnd')?.addEventListener('click', renderHome);
}

function renderEmpty(q) {
  const [h, p] = EMPTY_MSGS[emptyIdx++ % EMPTY_MSGS.length];
  res.innerHTML = `<div class="meta-row"><div class="count"><strong>0</strong> wyników w Twoich materiałach</div><div class="scope">cisza w zeszycie</div></div>
    <div class="empty">${MASCOT}<div class="bubble"><h2>${esc(h)}</h2><p>${esc(p)}</p></div>
    <div class="hints">${hintsHTML(['prompty', 'agenci', 'błędy LLM', 'Streamlit'])}</div></div>`;
}

function renderResults() {
  if (!lastResults.length) return renderEmpty(lastQuery);
  const n = lastResults.length;
  const list = lastResults.slice(0, shown);
  res.innerHTML = `<div class="meta-row"><div class="count"><strong>${n}</strong> ${plural(n, 'wynik', 'wyniki', 'wyników')} w Twoich materiałach</div>
      <div class="tools"><button class="link-btn" id="selToggle">${selectMode ? 'gotowe' : 'zaznacz'}</button></div></div>
    ${state.ready ? '' : '<div class="mode-note">Na razie szukam po słowach — wyszukiwanie po znaczeniu jeszcze się budzi.</div>'}
    ${list.map((r, i) => cardHTML(r, i)).join('')}
    ${n > shown ? `<button class="btn more-btn big" id="moreBtn">Pokaż więcej (${n - shown})</button>` : ''}`;
  $('#moreBtn')?.addEventListener('click', () => { shown += 10; renderResults(); });
  $('#selToggle')?.addEventListener('click', () => selectMode ? exitSelect() : enterSelect());
}

async function runSearch(q, { keepShown = false } = {}) {
  q = q.trim(); lastQuery = q;
  $('#clearQ').hidden = !q;
  if (!q) { lastResults = []; exitSelect(); return renderHome(); }
  const seq = ++searchSeq;
  const out = await search(q);
  if (seq !== searchSeq) return;
  lastResults = out.results; if (!keepShown) shown = 10;
  renderResults();
}
let deb;
qEl.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => runSearch(qEl.value), 280); });
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); clearTimeout(deb); qEl.blur(); runSearch(qEl.value); });
$('#clearQ').addEventListener('click', () => { qEl.value = ''; runSearch(''); qEl.focus(); });

res.addEventListener('click', e => {
  const chip = e.target.closest('.hint-chip');
  if (chip) { qEl.value = chip.dataset.q; runSearch(chip.dataset.q); return; }
  const card = e.target.closest('.card'); if (!card) return;
  const doc = state.docs.find(d => d.id === card.dataset.id);
  if (selectMode) { if (e.target.closest('a')) return; e.preventDefault(); toggleSel(card); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'open') openReader(doc);
});
longPress(res, '.card', card => {
  const doc = state.docs.find(d => d.id === card.dataset.id);
  if (selectMode) { toggleSel(card); return; }
  openSheet(doc);
});

// ---------- multi-select ----------
function enterSelect(firstId) {
  selectMode = true; selected.clear(); if (firstId) selected.add(firstId);
  renderResults(); $('#selectBar').hidden = false; updateSelBar();
}
function exitSelect() {
  if (!selectMode) return;
  selectMode = false; selected.clear(); $('#selectBar').hidden = true;
  if (lastQuery) renderResults();
}
function toggleSel(card) {
  const id = card.dataset.id;
  selected.has(id) ? selected.delete(id) : selected.add(id);
  card.classList.toggle('selected', selected.has(id)); updateSelBar();
}
function updateSelBar() { const n = selected.size; $('#sbCount').textContent = `Wybrano ${n}`; }
$('#sbCancel').addEventListener('click', exitSelect);
$('#sbMerge').addEventListener('click', () => {
  if (selected.size < 2) { toast('Zaznacz co najmniej 2 karteczki 🙂'); return; }
  const docs = [...selected].map(id => state.docs.find(d => d.id === id)).filter(Boolean);
  generate('instrukcja', docs);
});

// ---------- long-press sheet ----------
function openSheet(doc) {
  $('#sheetTitle').textContent = doc.title;
  const g = (ico, t, k, hint) => `<button class="sheet-act gen" data-g="${k}"><span class="ico">${ico}</span><span>${t}<small>${hint}</small></span></button>`;
  $('#sheetActions').innerHTML = `
    <button class="sheet-act main" data-s="read"><span class="ico">📖</span><span>Czytaj</span></button>
    ${g('🧭', 'Instrukcja', 'instrukcja', 'krok po kroku')}${g('🎓', 'Lekcja', 'lekcja', 'z pytaniami')}${g('🖼️', 'Prezentacja', 'prezentacja', 'slajdy')}${g('🃏', 'Fiszki', 'fiszki', 'do odwracania')}${g('✅', 'Test', 'test', 'z wynikiem')}
    <button class="sheet-act" data-s="select"><span class="ico">☑️</span><span>Zaznacz kilka<small>i połącz</small></span></button>`;
  $('#sheetActions').onclick = e => {
    const b = e.target.closest('.sheet-act'); if (!b) return;
    closeOverlay();
    if (b.dataset.g) { setTimeout(() => generate(b.dataset.g, [doc]), 60); return; }
    if (b.dataset.s === 'read') setTimeout(() => openReader(doc), 50);
    if (b.dataset.s === 'select') enterSelect(doc.id);
  };
  openOverlay('sheet');
}

// ---------- reader ----------
function highlighter(q) {
  const qs = new Set(tokens(q)); 
  return (raw) => {
    if (!qs.size) return esc(raw);
    return raw.split(/([\p{L}\p{N}]+)/u).map((w, i) => i % 2 && w.length > 1 && qs.has(stem(w)) ? `<mark>${esc(w)}</mark>` : esc(w)).join('');
  };
}
function inline(raw, hl) {
  return raw.split(/(https?:\/\/[^\s)]+)/).map((s, i) => i % 2 ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>` : hl(s)).join('');
}
function formatText(text, q) {
  const hl = highlighter(q), out = []; let list = null;
  const flush = () => { if (list) { out.push(`<${list.t}>${list.items.join('')}</${list.t}>`); list = null; } };
  for (let line of text.split('\n')) {
    line = line.trim(); if (!line) { flush(); continue; }
    let m;
    if ((m = line.match(/^#{1,4}\s+(.*)/))) { flush(); out.push(`<h3>${inline(m[1], hl)}</h3>`); }
    else if ((m = line.match(/^[•\-*–]\s+(\d+[.)]\s+.*)/))) { flush(); out.push(`<p class="step">${inline(m[1], hl)}</p>`); }
    else if ((m = line.match(/^[•\-*–]\s+(.*)/))) { if (list?.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(`<li>${inline(m[1], hl)}</li>`); }
    else if ((m = line.match(/^\d+[.)]\s+(.*)/))) { if (list?.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(`<li>${inline(m[1], hl)}</li>`); }
    else { flush(); out.push(`<p>${inline(line, hl)}</p>`); }
  }
  flush(); return out.join('');
}
function openReader(doc) {
  const [cls, label] = typeOf(doc.type), isLink = doc.k === 'l';
  $('#readerKicker').textContent = doc.src || '';
  const orig = $('#readerOrig'); orig.href = doc.url || '#'; orig.hidden = !doc.url;
  orig.textContent = isLink ? 'Otwórz link' : 'Oryginał';
  const also = (doc.also || []).filter(a => a.src);
  $('#readerBody').innerHTML = `
    <span class="pill ${cls}" style="font-family:'Baloo 2';font-weight:700;font-size:11px;color:#fff;border-radius:99px;padding:2px 8px 1px">${esc(label)}</span>
    <h1 id="readerTitle">${esc(doc.title)}</h1>
    ${doc.section && doc.section.trim() !== doc.title.trim() ? `<div class="crumbs">${esc(doc.section)}</div>` : ''}
    ${doc.tags?.length ? `<div class="tags">${doc.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="txt">${formatText(doc.text || doc.summary || '', lastQuery)}</div>
    <div class="src">Źródło: ${doc.url && !isLink ? `<a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.src)}</a>` : esc(doc.src)}
      ${isLink && doc.docUrl ? `<br>Link znaleziony w: <a href="${esc(doc.docUrl)}" target="_blank" rel="noopener">${esc(doc.src)}</a>` : ''}
      ${also.length ? `<div class="also">To samo jest też w: ${also.map(a => a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.src)}</a>` : esc(a.src)).join(', ')}</div>` : ''}
      ${doc.words ? `<div>${doc.words} słów · ok. ${Math.max(1, Math.round(doc.words / 200))} min czytania</div>` : ''}
    </div>
    <div class="r-actions">
      ${doc.url ? `<a class="btn primary" href="${esc(doc.url)}" target="_blank" rel="noopener">${isLink ? 'Otwórz link' : 'Otwórz oryginał'}</a>` : ''}
      <button class="btn" data-gen="lekcja">🎓 Zrób z tego lekcję</button>
      <button class="btn" data-gen="fiszki">🃏 Fiszki</button>
    </div>`;
  $('#readerBody').querySelectorAll('[data-gen]').forEach(b => b.onclick = () => { closeOverlay(); setTimeout(() => generate(b.dataset.gen, [doc]), 60); });
  openOverlay('reader');
  $('#reader .reader-sheet').scrollTop = 0;
}

// ---------- model status ----------
function fmtMB(b) { return (b / 1048576).toFixed(0); }
async function bootModel() {
  const box = $('#modelStatus'), txt = $('#msText'), pct = $('#msPct'), bar = $('#msBar');
  let shownBox = false;
  const showT = setTimeout(() => { box.hidden = false; shownBox = true; }, 700);
  try {
    await startModel(p => {
      const f = p.total ? p.loaded / p.total : 0;
      if (!p.cached) { box.hidden = false; shownBox = true; txt.textContent = 'Pierwsze uruchomienie: pobieram mózg wyszukiwarki (tylko raz)…'; pct.textContent = `${fmtMB(p.loaded)}/${fmtMB(p.total)} MB`; }
      else { txt.textContent = 'Budzę wyszukiwarkę…'; pct.textContent = Math.round(f * 100) + '%'; }
      bar.style.width = (f * 100).toFixed(1) + '%';
    });
    clearTimeout(showT);
    if (shownBox) {
      box.classList.add('ok'); txt.textContent = 'Wyszukiwarka gotowa — działa też bez internetu ✨'; pct.textContent = '';
      setTimeout(() => (box.hidden = true), 2600);
    }
    if (lastQuery) runSearch(lastQuery, { keepShown: true });
  } catch (e) {
    clearTimeout(showT); console.error(e);
    box.hidden = false; txt.textContent = 'Nie udało się obudzić wyszukiwania po znaczeniu — szukam po słowach.'; pct.textContent = '';
    bar.parentElement.hidden = true;
  }
}

// ---------- boot ----------
async function boot() {
  route();
  initIdeas(updateChip);
  initBadges(updateChip);
  initMaterials(updateChip);
  try {
    await loadData();
  } catch (e) {
    res.innerHTML = `<div class="welcome"><div class="bubble"><h2>Ups, nie mogę wczytać notatek.</h2><p>Sprawdź internet i odśwież stronę.</p></div></div>`;
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.get('q')) { qEl.value = params.get('q'); }
  runSearch(qEl.value);
  bootModel();
  navigator.storage?.persist?.().catch(() => {});
}
boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let swReloaded = false;
  const hadCtl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadCtl && !swReloaded) { swReloaded = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
    const check = () => r.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(e => console.warn('SW', e)));
}
window.__baza = { state, runSearch };
