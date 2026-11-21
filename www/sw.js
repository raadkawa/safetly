// Safetly service worker: appen virker offline (skall og skrift). Data hentes alltid fra Supabase.
const CACHE = 'safetly-v3';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'omrade.js', 'vendor/supabase.js', 'vendor/leaflet.js', 'vendor/leaflet.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/figtree-400.woff2', 'fonts/figtree-600.woff2', 'fonts/figtree-700.woff2', 'fonts/bricolage-700.woff2', 'fonts/bricolage-800.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Nett først, så vi får nye versjoner; faller tilbake til lagret kopi offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
