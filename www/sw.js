// Safetly service worker.
// Appen hentes alltid fra nettet når det er mulig (sjekker om filene er endret), og fra lagret kopi når du er offline.
// Slik får alle nye versjoner automatisk. Data hentes alltid direkte fra Supabase.
const CACHE = 'safetly-__VERSION__';
const SHELL = [
  './', 'index.html', 'offline.html', 'manifest.webmanifest', 'vendor/supabase.js', 'vendor/leaflet.js', 'vendor/leaflet.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/figtree-400.woff2', 'fonts/figtree-600.woff2', 'fonts/figtree-700.woff2', 'fonts/bricolage-700.woff2', 'fonts/bricolage-800.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // alltid rett fra nettet
  // Nett først, og be nettleseren sjekke om fila er endret (ikke bruke gammel kopi fra HTTP-cachen).
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
