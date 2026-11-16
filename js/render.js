// Renderowanie materiałów (instrukcja, lekcja, prezentacja, fiszki, test).
// Ten sam kod działa w aplikacji i w pobranym pliku HTML (wire() jest wklejane do pliku).

export const KIND_INFO = {
  instrukcja: { ico: '🧭', label: 'Instrukcja', color: '#3cefff' },
  lekcja: { ico: '🎓', label: 'Lekcja', color: '#c6ff3a' },
  prezentacja: { ico: '🖼️', label: 'Prezentacja', color: '#ffd36a' },
  fiszki: { ico: '🃏', label: 'Fiszki', color: '#ff3dae' },
  test: { ico: '✅', label: 'Test', color: '#c9b6ff' },
};

const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const para = s => String(s ?? '').split(/\n+/).filter(x => x.trim()).map(x => `<p>${e(x)}</p>`).join('');
const L = 'ABCDEFGH';

export function renderMaterial(m) {
  const d = m.data || {}, k = KIND_INFO[m.kind] || KIND_INFO.lekcja;
  let body = '';
  if (m.kind === 'instrukcja') {
    body = `${d.intro ? `<div class="m-intro">${para(d.intro)}</div>` : ''}
      <ol class="m-steps">${(d.steps || []).map((s, i) => `<li class="m-step"><span class="m-num">${i + 1}</span><div><h3>${e(s.title)}</h3>${para(s.detail)}</div></li>`).join('')}</ol>
      ${d.tips?.length ? `<div class="m-tips"><h3>💡 Wskazówki</h3><ul>${d.tips.map(t => `<li>${e(t)}</li>`).join('')}</ul></div>` : ''}`;
  } else if (m.kind === 'lekcja') {
    body = `${d.intro ? `<div class="m-intro">${para(d.intro)}</div>` : ''}
      ${(d.sections || []).map((s, i) => `<section class="m-sec"><h3><span class="m-secn">${i + 1}</span>${e(s.heading)}</h3>${para(s.content)}</section>`).join('')}
      ${d.questions?.length ? `<div class="m-check"><h3>🤔 Sprawdź się</h3>${d.questions.map((q, i) => `<div class="m-qa"><p class="m-q">${i + 1}. ${e(q.q)}</p><button class="m-btn" data-reveal>Pokaż odpowiedź</button><div class="m-a" hidden>${para(q.a)}</div></div>`).join('')}</div>` : ''}
      ${d.summary ? `<div class="m-sum"><h3>✨ W skrócie</h3>${para(d.summary)}</div>` : ''}`;
  } else if (m.kind === 'prezentacja') {
    const slides = [`<div class="m-slide m-slide-title"><div class="m-sl-ico">🖼️</div><h2>${e(d.title || m.title)}</h2>${d.subtitle ? `<p>${e(d.subtitle)}</p>` : ''}<span class="m-hint">przesuń palcem ➜</span></div>`,
      ...(d.slides || []).map((s, i) => `<div class="m-slide"><span class="m-sl-n">${i + 1}</span><h2>${e(s.title)}</h2><ul>${(s.bullets || []).map(b => `<li>${e(b)}</li>`).join('')}</ul>${s.note ? `<p class="m-note">🗒️ ${e(s.note)}</p>` : ''}</div>`)];
    body = `<div class="m-deck" data-deck><div class="m-track">${slides.join('')}</div>
      <div class="m-deck-nav"><button class="m-btn" data-prev aria-label="Poprzedni">◀</button><span class="m-count" data-count>1 / ${slides.length}</span><button class="m-btn" data-next aria-label="Następny">▶</button></div>
      <div class="m-dots">${slides.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div></div>`;
  } else if (m.kind === 'fiszki') {
    const cards = d.cards || [];
    body = `<div class="m-fl-top"><span class="m-count" data-flipped>Odwrócone: 0 / ${cards.length}</span><button class="m-btn" data-shuffle>🔀 Przetasuj</button></div>
      <div class="m-flash" data-flash>${cards.map((c, i) => `<button class="m-card" data-flip><span class="m-card-in"><span class="m-front"><small>Pytanie ${i + 1}</small>${e(c.q)}<em>stuknij, żeby odwrócić</em></span><span class="m-back"><small>Odpowiedź</small>${e(c.a)}</span></span></button>`).join('')}</div>`;
  } else if (m.kind === 'test') {
    const qs = d.questions || [];
    body = `<div class="m-test" data-test data-total="${qs.length}">${qs.map((q, i) => `<div class="m-tq" data-correct="${q.correct | 0}">
        <p class="m-q"><span class="m-num sm">${i + 1}</span>${e(q.q)}</p>
        <div class="m-opts">${(q.options || []).map((o, j) => `<button class="m-opt" data-opt="${j}"><b>${L[j]}</b>${e(o)}</button>`).join('')}</div>
        <div class="m-expl" hidden>${e(q.explanation)}</div></div>`).join('')}
      <div class="m-score" data-score hidden></div>
      <div class="m-progress"><span data-answered>Odpowiedziano: 0 / ${qs.length}</span><button class="m-btn" data-retry hidden>🔁 Jeszcze raz</button></div></div>`;
  }
  const src = (m.sources || []).map(s => s.url ? `<a href="${e(s.url)}" target="_blank" rel="noopener">${e(s.title)}</a>` : e(s.title)).join(' · ');
  return `<div class="m-root m-${e(m.kind)}" style="--k:${k.color}">
    <div class="m-head"><span class="m-pill">${k.ico} ${k.label}</span><h1>${e(d.title || m.title)}</h1></div>
    ${body}
    ${src ? `<div class="m-src"><b>Zrobione z Twoich notatek:</b> ${src}</div>` : ''}
  </div>`;
}

// Interakcje. Uwaga: funkcja jest serializowana (toString) do pobranego pliku – bez importów i zmiennych z zewnątrz!
export function wire(root, hooks) {
  hooks = hooks || {};
  root.addEventListener('click', ev => {
    const t = ev.target;
    const rv = t.closest('[data-reveal]');
    if (rv) { const a = rv.nextElementSibling; a.hidden = !a.hidden; rv.textContent = a.hidden ? 'Pokaż odpowiedź' : 'Schowaj'; return; }
    const fc = t.closest('[data-flip]');
    if (fc) {
      fc.classList.toggle('flipped'); fc.dataset.seen = '1';
      const all = root.querySelectorAll('[data-flip]'), seen = root.querySelectorAll('[data-flip][data-seen]');
      const c = root.querySelector('[data-flipped]'); if (c) c.textContent = 'Odwrócone: ' + seen.length + ' / ' + all.length + (seen.length === all.length ? ' 🎉' : '');
      return;
    }
    if (t.closest('[data-shuffle]')) {
      const box = root.querySelector('[data-flash]'); const items = Array.from(box.children);
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      items.forEach(x => { x.classList.remove('flipped'); box.appendChild(x); }); return;
    }
    const op = t.closest('[data-opt]');
    if (op) {
      const q = op.closest('.m-tq'); if (q.dataset.done) return;
      q.dataset.done = '1'; const ok = +op.dataset.opt === +q.dataset.correct; q.dataset.ok = ok ? '1' : '';
      q.querySelectorAll('[data-opt]').forEach(b => { if (+b.dataset.opt === +q.dataset.correct) b.classList.add('ok'); b.disabled = true; });
      if (!ok) op.classList.add('bad');
      const ex = q.querySelector('.m-expl'); ex.hidden = false; ex.insertAdjacentHTML('afterbegin', ok ? '<b>Brawo! </b>' : '<b>Prawie! </b>');
      const test = q.closest('[data-test]'), total = +test.dataset.total;
      const done = test.querySelectorAll('.m-tq[data-done]').length, good = test.querySelectorAll('.m-tq[data-ok="1"]').length;
      test.querySelector('[data-answered]').textContent = 'Odpowiedziano: ' + done + ' / ' + total;
      if (done === total) {
        const pct = Math.round(good / total * 100), sc = test.querySelector('[data-score]');
        const msg = pct === 100 ? 'Perfekcyjnie! Jesteś mistrzynią 🏆' : pct >= 70 ? 'Świetnie Ci poszło! 🌟' : pct >= 40 ? 'Nieźle! Jeszcze jedno podejście i będzie ekstra 💪' : 'Dobry początek! Przeczytaj notatkę i spróbuj jeszcze raz 🌱';
        sc.innerHTML = '<div class="m-trophy">' + (pct >= 70 ? '🏆' : pct >= 40 ? '🌟' : '🌱') + '</div><div class="m-big">' + good + ' / ' + total + '</div><div>' + pct + '% · ' + msg + '</div>';
        sc.hidden = false; test.querySelector('[data-retry]').hidden = false;
        sc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (hooks.onFinish) hooks.onFinish(good, total, sc);
      }
      return;
    }
    if (t.closest('[data-retry]')) {
      const test = t.closest('[data-test]');
      test.querySelectorAll('.m-tq').forEach(q => { delete q.dataset.done; delete q.dataset.ok; q.querySelectorAll('[data-opt]').forEach(b => { b.disabled = false; b.classList.remove('ok', 'bad'); });
        const ex = q.querySelector('.m-expl'); ex.hidden = true; const b = ex.querySelector('b'); if (b) b.remove(); });
      test.querySelector('[data-score]').hidden = true; t.closest('[data-retry]').hidden = true;
      test.querySelector('[data-answered]').textContent = 'Odpowiedziano: 0 / ' + test.dataset.total;
      test.scrollIntoView({ behavior: 'smooth' }); return;
    }
    const deck = t.closest('[data-deck]');
    if (deck && (t.closest('[data-prev]') || t.closest('[data-next]'))) {
      const tr = deck.querySelector('.m-track'), w = tr.clientWidth, i = Math.round(tr.scrollLeft / w) + (t.closest('[data-next]') ? 1 : -1);
      tr.scrollTo({ left: Math.max(0, i) * w, behavior: 'smooth' });
    }
  });
  root.querySelectorAll('[data-deck]').forEach(deck => {
    const tr = deck.querySelector('.m-track'), n = tr.children.length, dots = deck.querySelectorAll('.m-dots i');
    tr.addEventListener('scroll', () => {
      const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
      deck.querySelector('[data-count]').textContent = (i + 1) + ' / ' + n;
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
    }, { passive: true });
  });
}

// mała fanfara + konfetti dla pobranego pliku
export function miniCelebrate(good, total, el) {
  if (good / total < 0.5) return;
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    [[523.25, 0], [659.25, .12], [783.99, .24], [1046.5, .38]].forEach(function (n) {
      const o = A.createOscillator(), g = A.createGain(); o.type = 'triangle'; o.frequency.value = n[0]; o.connect(g); g.connect(A.destination);
      const s = A.currentTime + n[1], d = n[1] > .3 ? .55 : .16; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.12, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + d); o.start(s); o.stop(s + d + .05);
    });
  } catch (x) { }
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('span'); s.textContent = ['🎉', '⭐', '✨', '💖', '🏆'][i % 5]; s.className = 'm-boom';
    s.style.left = (10 + Math.random() * 80) + 'vw'; s.style.animationDelay = (Math.random() * .4) + 's'; document.body.appendChild(s); setTimeout(() => s.remove(), 2200);
  }
}
