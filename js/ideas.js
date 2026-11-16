import { $, esc, toast, confirmDialog, confetti, fanfare, TROPHY_SVG } from './ui.js';

const KEY = 'baza.pomysly.v1';
let ideas = [], onChange = () => {};
const load = () => { try { ideas = JSON.parse(localStorage.getItem(KEY)) || []; } catch { ideas = []; } };
const save = () => { localStorage.setItem(KEY, JSON.stringify(ideas)); onChange(); };
const TRASH = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="#140c0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEERS = ['Brawo, Magda! 🎉', 'Zrobione! Jesteś niesamowita ✨', 'Kolejny pomysł odhaczony! 🏆', 'Mistrzyni! Fanfary dla Ciebie 🎺'];
const HINT = p => p === 0 ? 'jeszcze nie ruszony' : p < 30 ? 'dobry początek' : p < 60 ? 'idzie świetnie' : p < 90 ? 'już prawie!' : 'ostatnia prosta!';

export function ideasSummary() {
  const a = ideas.filter(i => !i.done).length;
  return `${a} w toku`;
}

function ideaHTML(i) {
  if (i.done) {
    const d = new Date(i.doneAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="idea done" data-id="${i.id}"><div class="idea-top">${TROPHY_SVG}
      <div style="flex:1;min-width:0"><div class="idea-title">${esc(i.title)}</div><div class="done-date">ukończone ${d}<button class="undo" data-undo>cofnij</button></div></div>
      <button class="idea-del" data-del aria-label="Usuń">${TRASH}</button></div></div>`;
  }
  return `<div class="idea" data-id="${i.id}">
    <div class="idea-top"><div class="idea-title">${esc(i.title)}</div><button class="idea-del" data-del aria-label="Usuń pomysł">${TRASH}</button></div>
    <div class="idea-prog"><div class="pbar"><i class="${i.progress ? '' : 'w0'}" style="width:${i.progress}%"></i></div><span class="pct">${i.progress}%</span></div>
    <input class="slider" type="range" min="0" max="100" step="5" value="${i.progress}" aria-label="Postęp: ${esc(i.title)}" />
    <div class="idea-hint">${HINT(i.progress)}</div>
  </div>`;
}

function render() {
  const active = ideas.filter(i => !i.done), done = ideas.filter(i => i.done).sort((a, b) => b.doneAt - a.doneAt);
  $('#ideasActive').innerHTML = active.length ? active.map(ideaHTML).join('') :
    `<div class="ideas-empty"><span class="big">💡</span>${done.length ? 'Wszystko zrobione! Czas na nowy pomysł?' : 'Tu zamieszkają Twoje pomysły.<br>Wpisz pierwszy powyżej!'}</div>`;
  $('#ideasDone').innerHTML = done.map(ideaHTML).join('');
  $('#doneLabel').hidden = !done.length;
  $('#doneCount').textContent = done.length ? `${done.length}` : '';
}

function complete(i, el) {
  i.progress = 100; i.done = true; i.doneAt = Date.now(); save();
  el.classList.add('celebrate'); confetti(el); fanfare();
  toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(render, 330); }, 700);
}

export function initIdeas(cb) {
  onChange = cb || onChange; load(); render();
  $('#ideaForm').addEventListener('submit', e => {
    e.preventDefault(); const t = $('#ideaInput').value.trim(); if (!t) return;
    ideas.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: t, progress: 0, done: false, createdAt: Date.now() });
    $('#ideaInput').value = ''; save(); render(); toast('Dodane! 💡');
  });
  const box = $('#view-pomysly');
  box.addEventListener('input', e => {
    if (!e.target.classList.contains('slider')) return;
    const el = e.target.closest('.idea'), i = ideas.find(x => x.id === el.dataset.id), v = +e.target.value;
    el.querySelector('.pbar i').style.width = v + '%'; el.querySelector('.pbar i').classList.toggle('w0', !v);
    el.querySelector('.pct').textContent = v + '%'; el.querySelector('.idea-hint').textContent = HINT(v);
    i.progress = v;
  });
  box.addEventListener('change', e => {
    if (!e.target.classList.contains('slider')) return;
    const el = e.target.closest('.idea'), i = ideas.find(x => x.id === el.dataset.id);
    if (i.progress >= 100) complete(i, el); else save();
  });
  box.addEventListener('click', async e => {
    const el = e.target.closest('.idea'); if (!el) return;
    const i = ideas.find(x => x.id === el.dataset.id);
    if (e.target.closest('[data-del]')) {
      if (await confirmDialog('Usunąć pomysł?', `„${i.title}” zniknie na dobre. Na pewno?`)) {
        el.classList.add('leaving');
        setTimeout(() => { ideas = ideas.filter(x => x !== i); save(); render(); }, 320);
      }
    } else if (e.target.closest('[data-undo]')) {
      i.done = false; i.progress = 90; delete i.doneAt; save(); render(); toast('Wraca do roboty — 90% 💪');
    }
  });
}
