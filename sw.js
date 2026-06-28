const CACHE = 'flint-v319';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './logo.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png', './bg-home.png', './recup-body.png', './recup-empty.png?v=3', './steps-empty.png?v=2', './steps-hero.png?v=1', './balance-hero.png?v=7', './act-run.png?v=2', './act-ski.png?v=2', './act-surf.png?v=2', './act-danse.png?v=2', './act-golf.png?v=2', './act-velo.png?v=2', './act-renfo.png?v=2', './act-muscu.png?v=2', './act-football.png?v=2', './act-natation.png?v=2', './act-randonnee.png?v=2', './act-rameur.png?v=2', './act-corde.png?v=2', './act-triathlon.png?v=2', './act-elliptique.png?v=2', './act-tennis.png?v=2', './act-basket.png?v=2', './act-rugby.png?v=2', './act-volley.png?v=2', './act-handball.png?v=2', './act-karate.png?v=2', './act-judo.png?v=2', './act-snowboard.png?v=2', './act-skate.png?v=2', './act-patinage.png?v=2', './act-padel.png?v=2', './act-squash.png?v=2', './act-badminton.png?v=2', './act-pingpong.png?v=2', './act-boxe.png?v=2', './act-mma.png?v=2', './act-yoga.png?v=2', './act-pilates.png?v=2', './act-mobilite.png?v=2', './act-escalade.png?v=2', './nutri-hero.png?v=2', './fc-art.png?v=1'];
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
