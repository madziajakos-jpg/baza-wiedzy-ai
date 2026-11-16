// Service worker: offline dla aplikacji. Model (models/) cache'uje sam worker wyszukiwarki (Cache "baza-model-v1").
const VERSION = 'v1-202611161911';
const SHELL = 'baza-shell-' + VERSION;
const RUNTIME = 'baza-runtime-' + VERSION;
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/app.css', 'css/gen.css',
  'js/app.js', 'js/ui.js', 'js/search.js', 'js/search-core.js', 'js/ideas.js', 'js/badges.js', 'js/embed-worker.js', 'js/gen.js', 'js/render.js', 'js/config.js',
  'data/meta.json', 'data/docs.json', 'data/emb.bin',
  'fonts/Baloo2.woff2', 'fonts/Nunito.woff2', 'fonts/Nunito-Italic.woff2', 'fonts/LuckiestGuy-Regular.woff2', 'fonts/PatrickHand-Regular.woff2', 'fonts/Bangers-Regular.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png',
  ...['cert_8c7a49', 'cert_11a560', 'cert_1e0391', 'cert_67100d', 'cert_ac9154', 'cert_6c12a1', 'cert_3a5114', 'cert_f187a4'].flatMap(c => [`img/certs/${c}.webp`, `img/certs/${c}_t.webp`]),
  'vendor/transformers.min.js', 'vendor/ort-wasm-simd-threaded.jsep.mjs', 'vendor/ort-wasm-simd-threaded.jsep.wasm',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('baza-shell-') || k.startsWith('baza-runtime-')) && k !== SHELL && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/models/')) return; // obsługuje embed-worker (własny cache)
  const isNav = req.mode === 'navigate';
  const isData = url.pathname.includes('/data/');
  if (isNav || isData) { e.respondWith(networkFirst(req, isNav)); return; }
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req, isNav) {
  const c = await caches.open(SHELL);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
    if (r.ok) c.put(isNav ? 'index.html' : req, r.clone());
    return r;
  } catch {
    const hit = await caches.match(isNav ? 'index.html' : req, { ignoreSearch: true });
    return hit || (isNav ? caches.match('./') : Response.error());
  }
}
async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(RUNTIME)).put(req, r.clone());
    return r;
  } catch { return Response.error(); }
}
