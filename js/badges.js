import { $, esc, toast, openOverlay, closeOverlay, confirmDialog, confetti } from './ui.js';

const BUILTIN = [
  { id: 'cert_8c7a49', kind: 'badge', group: 'openai', title: 'AI Foundations', issuer: 'OpenAI Academy', alt: 'Odznaka OpenAI Academy: AI Foundations' },
  { id: 'cert_11a560', kind: 'badge', group: 'openai', title: 'Applied AI Foundations', issuer: 'OpenAI Academy', alt: 'Odznaka OpenAI Academy: Applied AI Foundations' },
  { id: 'cert_1e0391', kind: 'badge', group: 'openai', title: 'Agents and Workflows', issuer: 'OpenAI Academy', alt: 'Odznaka OpenAI Academy: Agents and Workflows' },
  { id: 'cert_67100d', kind: 'wide', group: 'openai', title: 'Course Completion: AI Foundations', issuer: 'OpenAI Academy', date: '7 wrz 2026', alt: 'Certyfikat ukończenia kursu AI Foundations, OpenAI Academy, 7 września 2026' },
  { id: 'cert_ac9154', kind: 'cert', group: 'google', title: 'AI Fundamentals', issuer: 'Google / Coursera', date: '4 sie 2026', verify: 'https://coursera.org/verify/8S3UAA845791' },
  { id: 'cert_6c12a1', kind: 'cert', group: 'google', title: 'AI for Brainstorming and Planning', issuer: 'Google / Coursera', date: '5 sie 2026', verify: 'https://coursera.org/verify/CZUPHPWC7592' },
  { id: 'cert_3a5114', kind: 'cert', group: 'google', title: 'AI for Research and Insights', issuer: 'Google / Coursera', date: '6 sie 2026', verify: 'https://coursera.org/verify/PGCPDN0LK6JV' },
  { id: 'cert_f187a4', kind: 'cert', group: 'google', title: 'AI for Writing and Communicating', issuer: 'Google / Coursera', date: '13 sie 2026', verify: 'https://coursera.org/verify/B31Y1Q5XENV0' },
];

// ---- IndexedDB ----
const DB = 'baza-odznaki', STORE = 'badges';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); });
}
const getAll = () => tx('readonly', s => s.getAll());
const putOne = (b) => tx('readwrite', s => s.put(b));
const delOne = (id) => tx('readwrite', s => s.delete(id));

let custom = [], urls = new Map(), onChange = () => {};
export const badgesCount = () => BUILTIN.length + custom.length;
const img = (b, thumb) => b.blob ? urls.get(b.id) : `img/certs/${b.id}${thumb ? '_t' : ''}.webp`;

const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const cap = b => `${esc(b.title)}<span class="issuer">${esc([b.issuer, b.date || fmtDate(b.dateISO)].filter(Boolean).join(' · '))}</span>`;

function render() {
  const o = BUILTIN.filter(b => b.group === 'openai'), g = BUILTIN.filter(b => b.group === 'google');
  $('#badges').innerHTML = `
    <div class="page-title"><h1>Odznaki</h1><span class="sub">w ramkach, na ścianie</span></div>
    <div class="section-label"><span>OpenAI Academy</span><span class="bar"></span></div>
    <div class="badge-row">${o.filter(b => b.kind === 'badge').map(b => `<figure class="badge-item" data-id="${b.id}"><div class="badge-frame"><img src="${img(b, true)}" alt="${esc(b.alt)}" loading="lazy" /></div><figcaption>${cap(b)}</figcaption></figure>`).join('')}</div>
    <div class="cert-wide-wrap">${o.filter(b => b.kind === 'wide').map(b => `<figure class="cert-item wide" data-id="${b.id}" style="--frame-bg:#7ee9ff;--frame-shadow:#ff3dae;--tilt:-1deg"><div class="cert-frame"><img src="${img(b, true)}" alt="${esc(b.alt)}" loading="lazy" /></div><figcaption>${cap(b)}</figcaption></figure>`).join('')}</div>
    <div class="section-label google"><span>Google / Coursera</span><span class="bar"></span></div>
    <div class="cert-grid">${g.map(b => `<figure class="cert-item" data-id="${b.id}"><div class="cert-frame"><img src="${img(b, true)}" alt="Certyfikat ${esc(b.issuer)}: ${esc(b.title)}" loading="lazy" /></div><figcaption>${cap(b)}</figcaption></figure>`).join('')}</div>
    <div class="section-label"><span>Moje nowe</span><span class="bar"></span></div>
    <div class="cert-grid">
      ${custom.map(b => `<figure class="cert-item" data-id="${b.id}"><div class="cert-frame"><img class="contain" src="${img(b)}" alt="${esc(b.title)}" /></div><figcaption>${cap(b)}</figcaption></figure>`).join('')}
      <figure class="cert-item add" id="addBadgeBtn" role="button" tabindex="0" aria-label="Dodaj odznakę"><div class="cert-frame"><span class="plus">+</span></div><figcaption>Dodaj odznakę<span class="issuer">zdjęcie lub zrzut ekranu</span></figcaption></figure>
    </div>`;
}

function openLightbox(b) {
  const isBadge = b.kind === 'badge';
  $('#lbImg').src = img(b); $('#lbImg').alt = b.alt || b.title;
  $('#lightbox .lb-frame').classList.toggle('round', isBadge);
  $('#lbCap').innerHTML = `<h3>${esc(b.title)}</h3><p>${esc([b.issuer, b.date || fmtDate(b.dateISO)].filter(Boolean).join(' · '))}</p>
    <div class="lb-actions">${b.verify ? `<a class="btn primary" href="${esc(b.verify)}" target="_blank" rel="noopener">Sprawdź na Coursera</a>` : ''}
    ${b.blob ? '<button class="btn danger" id="lbDel">Zdejmij ze ściany</button>' : ''}</div>`;
  $('#lbDel')?.addEventListener('click', async () => {
    closeOverlay();
    if (await confirmDialog('Zdjąć odznakę?', `„${b.title}” zniknie z galerii.`, 'Zdejmij')) {
      await delOne(b.id); URL.revokeObjectURL(urls.get(b.id)); await refresh(); toast('Zdjęte ze ściany');
    }
  });
  openOverlay('lightbox');
}

async function refresh() {
  try { custom = (await getAll()).sort((a, b) => a.createdAt - b.createdAt); } catch { custom = []; }
  for (const b of custom) if (!urls.has(b.id)) urls.set(b.id, URL.createObjectURL(b.blob));
  render(); onChange();
}

export function initBadges(cb) {
  onChange = cb || onChange; render(); refresh();
  $('#badges').addEventListener('click', e => {
    if (e.target.closest('#addBadgeBtn')) return openAdd();
    const f = e.target.closest('[data-id]'); if (!f) return;
    const b = BUILTIN.find(x => x.id === f.dataset.id) || custom.find(x => x.id === f.dataset.id);
    if (b) openLightbox(b);
  });
  $('#badges').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'addBadgeBtn') openAdd(); });
  $('#badgeFile').addEventListener('change', () => {
    const f = $('#badgeFile').files[0]; if (!f) return;
    const p = $('#badgePreview'); p.src = URL.createObjectURL(f); p.hidden = false; $('#fileHint').hidden = true;
    if (!$('#badgeTitle').value) $('#badgeTitle').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 90);
  });
  $('#addBadgeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = $('#badgeFile').files[0]; if (!f) return toast('Wybierz zdjęcie odznaki 🙂');
    const blob = await shrink(f);
    const b = { id: 'u' + Date.now().toString(36), kind: 'cert', group: 'custom', title: $('#badgeTitle').value.trim() || 'Nowa odznaka',
      issuer: $('#badgeIssuer').value.trim(), dateISO: $('#badgeDate').value || '', blob, createdAt: Date.now() };
    try { await putOne(b); } catch (err) { return toast('Nie udało się zapisać 😕'); }
    closeOverlay(); await refresh();
    const el = document.querySelector(`[data-id="${b.id}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => confetti(el), 250); toast('Nowa odznaka na ścianie! 🏅');
  });
}

function openAdd() {
  $('#addBadgeForm').reset(); $('#badgePreview').hidden = true; $('#fileHint').hidden = false;
  openOverlay('addBadge');
}

// zmniejsz zdjęcie do max 1600 px, żeby IndexedDB nie puchło
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 1.5e6) return file;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/webp', 0.88));
  } catch { return file; }
}
