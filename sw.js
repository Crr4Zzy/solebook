// Offline support: app files are served from the network when possible (so updates arrive)
// and from the cache when there is no connection. Data lives in IndexedDB, not here.
const CACHE = 'solebook-v6';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/main.js', './js/util.js', './js/store.js', './js/sample.js', './js/sync.js', './js/ui.js', './js/sheets.js',
  './js/io.js', './js/share.js', './js/scanner.js', './js/importer.js', './js/salestable.js', './js/catalog.js',
  './js/views/panel.js', './js/views/ventas.js', './js/views/vender.js', './js/views/clientes.js',
  './js/views/stock.js', './js/views/informes.js', './js/views/ajustes.js', './js/views/mas.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase etc. go straight to the network
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
