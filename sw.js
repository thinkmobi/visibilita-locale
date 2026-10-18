// Cache dell'app per l'uso offline. I dati (api.github.com) non passano mai da qui.
const CACHE = 'vl-1.6.6';
const FILE = ['./', 'index.html', 'stile.css', 'app.js', 'logica.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'motore/fonts/PlexSans-Regular.ttf', 'motore/fonts/PlexSans-Medium.ttf', 'motore/fonts/PlexSans-SemiBold.ttf', 'motore/fonts/PlexCond-Bold.ttf', 'motore/fonts/PlexMono-Medium.ttf'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // rete prima (aggiornamenti immediati), cache se offline
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
