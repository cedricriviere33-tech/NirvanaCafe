/* Nirvana Café — service worker (offline).
   Réseau d'abord, cache en secours. N'intercepte QUE le même domaine
   (Supabase & CDN passent normalement → la synchro cloud reste intacte). */
const CACHE = 'nirvana-v11';  // bump : login clavier num, police emoji locale, carte unifiée
const CORE = ['./', './index.html', './qrcode.js', './cloud.js', './noto-emoji.woff2',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

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
  if (url.origin !== location.origin) return; // laisse passer Supabase / CDN
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
