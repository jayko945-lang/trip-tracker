// Offline support. Every app file is cached on install, so the app works
// with no network. Requests are served from the cache first; when online,
// each file is re-downloaded in the background. If a file changed, the page
// is told an update is ready, and can ask for every file to be refreshed
// before it reloads (so it never runs a mix of old and new files).
// Bump VERSION when you add or rename files.
const VERSION = 'v7';
const CACHE = `trip-tracker-${VERSION}`;
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/dates.js',
  './js/domain.js',
  './js/ics.js',
  './js/seed.js',
  './js/store.js',
  './js/templates.js',
  './js/ui.js',
  './js/views/common.js',
  './js/views/edit.js',
  './js/views/home.js',
  './js/views/settings.js',
  './js/views/trip.js',
  './js/views/trips.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('trip-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage(msg));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App navigations always get the cached shell (the app uses hash routes).
  const navigate = req.mode === 'navigate';
  const key = navigate ? './index.html' : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: navigate });
    const old = cached?.clone();
    // 'no-cache' revalidates with the server instead of trusting the HTTP cache.
    const network = fetch(navigate ? './index.html' : req.url, { cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok || res.type !== 'basic') return res;
        if (old) {
          const [a, b] = await Promise.all([old.text(), res.clone().text()]);
          if (a !== b) await notifyClients({ type: 'update-ready' });
        }
        await cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});

// The page asks for a full refresh when the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'apply-update') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    } catch { /* offline: reload with what we have */ }
    event.source?.postMessage({ type: 'update-applied' });
  })());
});
