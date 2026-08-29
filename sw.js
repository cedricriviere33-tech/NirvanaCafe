/* Nirvana Café — service worker (offline).
   Réseau d'abord, cache en secours. N'intercepte QUE le même domaine
   (Supabase & CDN passent normalement → la synchro cloud reste intacte). */
const CACHE = 'nirvana-v10';  // bump : familles/photos/immersion + cache police emoji (Win7)
const CORE = ['./', './index.html', './menu.html', './qrcode.js', './cloud.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']; // police emoji Noto (Windows 7)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Police emoji Google Fonts : cache d'abord (immuable), pour un rendu offline sur le terminal.
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req).then(hit =>
        hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit)))
    );
    return;
  }
  if (url.origin !== location.origin) return; // laisse passer Supabase / CDN
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
