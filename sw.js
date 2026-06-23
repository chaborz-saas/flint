const CACHE = 'flint-v249';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './logo.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png', './bg-home.png', './recup-body.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(a).catch(()=>{})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // laisse les polices/CDN aller au réseau
  // Réseau d'abord pour les navigations (HTML) : l'index.html déployé n'est jamais servi périmé
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(resp => { if (resp && resp.ok) { const c = resp.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)).catch(()=>{}); } return resp; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // Cache d'abord pour les assets statiques (on ne met en cache que les réponses valides)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => { if (resp && resp.ok) { const c = resp.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)).catch(()=>{}); } return resp; }).catch(() => caches.match('./index.html'))));
});
