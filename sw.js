const CACHE = 'flint-v82';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './logo.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return; // let fonts etc go to network
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => { const c = resp.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)).catch(()=>{}); return resp; }).catch(() => caches.match('./index.html'))));
});
