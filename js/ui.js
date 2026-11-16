export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT;
export function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

// overlays with back-button support
const stack = [];
export function openOverlay(id, onClose) {
  const o = document.getElementById(id); o.hidden = false; stack.push({ id, onClose });
  history.pushState({ overlay: id }, '');
  document.body.style.overflow = 'hidden';
}
export function closeOverlay(fromPop = false) {
  const top = stack.pop(); if (!top) return;
  document.getElementById(top.id).hidden = true; top.onClose?.();
  if (!stack.length) document.body.style.overflow = '';
  if (!fromPop) history.back();
}
window.addEventListener('popstate', () => { if (stack.length) closeOverlay(true); });
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { e.preventDefault(); closeOverlay(); return; }
  if (e.target.classList?.contains('overlay')) closeOverlay();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) closeOverlay(); });

export function confirmDialog(title, text, yes = 'Usuń') {
  return new Promise(res => {
    $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmYes').textContent = yes;
    let answered = false;
    const done = v => { if (answered) return; answered = true; res(v); };
    $('#confirmYes').onclick = () => { done(true); closeOverlay(); };
    $('#confirmNo').onclick = () => { done(false); closeOverlay(); };
    openOverlay('confirm', () => done(false));
  });
}

// ---- confetti ----
export function confetti(originEl) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#confetti'), ctx = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const r = originEl?.getBoundingClientRect();
  const ox = r ? r.left + r.width / 2 : innerWidth / 2, oy = r ? r.top + r.height / 2 : innerHeight / 3;
  const colors = ['#3cefff', '#ff3dae', '#c6ff3a', '#ffd36a', '#fff7eb', '#c9b6ff'];
  const P = Array.from({ length: 140 }, () => {
    const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8;
    return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
      rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0], star: Math.random() < .18 };
  });
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight); t++;
    for (const p of P) {
      p.vy += .28; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.strokeStyle = '#140c0a'; ctx.lineWidth = 1.2;
      if (p.star) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 3 : 7, aa = i * Math.PI / 5; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    }
    if (t < 150) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

// ---- tiny fanfare (WebAudio, quiet) ----
export function fanfare() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [[523.25, 0], [659.25, .12], [783.99, .24], [1046.5, .38]];
    for (const [f, t] of notes) {
      const o = A.createOscillator(), g = A.createGain();
      o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(A.destination);
      const s = A.currentTime + t, d = t === .38 ? .55 : .16;
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.12, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + d);
      o.start(s); o.stop(s + d + .05);
    }
    setTimeout(() => A.close(), 1500);
  } catch { }
}

export const TROPHY_SVG = `<svg class="trophy" viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h20v10c0 7-4.5 12-10 12S14 23 14 16V6z" fill="#ffd36a" stroke="#140c0a" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 10H7c0 6 3 9 8 9M34 10h7c0 6-3 9-8 9" fill="none" stroke="#140c0a" stroke-width="2.4" stroke-linecap="round"/><path d="M24 28v6M17 42h14l-2-8H19z" fill="#ff3dae" stroke="#140c0a" stroke-width="2.4" stroke-linejoin="round"/><path d="M19 10c0 5 1 9 3 11" stroke="#fff7eb" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/><polygon points="24,11 25.5,14.5 29,15 26.5,17.5 27,21 24,19.3 21,21 21.5,17.5 19,15 22.5,14.5" fill="#fff7eb" stroke="#140c0a" stroke-width="1.2"/></svg>`;

// long-press helper: calls onLong(el) after 480ms without moving
export function longPress(container, selector, onLong) {
  let timer, startX, startY, target, fired = false;
  container.addEventListener('pointerdown', e => {
    const t = e.target.closest(selector); if (!t || e.target.closest('a,button')) return;
    target = t; fired = false; startX = e.clientX; startY = e.clientY;
    t.classList.add('pressing');
    timer = setTimeout(() => { fired = true; t.classList.remove('pressing'); navigator.vibrate?.(18); onLong(t); }, 480);
  });
  const cancel = () => { clearTimeout(timer); target?.classList.remove('pressing'); };
  container.addEventListener('pointermove', e => { if (target && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) cancel(); });
  container.addEventListener('pointerup', cancel); container.addEventListener('pointercancel', cancel);
  container.addEventListener('contextmenu', e => { if (e.target.closest(selector)) e.preventDefault(); });
  container.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
}
