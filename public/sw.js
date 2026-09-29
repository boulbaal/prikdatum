/* Whenly service worker.
 * Bij het deployen wordt __VERSION__ vervangen door het korte commitnummer,
 * zodat elke nieuwe versie een nieuwe cache-naam krijgt en de oude opgeruimd wordt.
 * Strategie:
 *   - navigatie (HTML) en /api/*  -> altijd eerst het netwerk (nooit een oude versie serveren)
 *   - vaste bestanden (iconen, manifest) -> eerst de cache (snel, werkt offline)
 */
const VERSION = '__VERSION__';
const CACHE = 'whenly-' + VERSION;
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

function isApp(pad) {
  return pad === '/' || /^\/[a-z]{2,3}\/?$/.test(pad) || pad.startsWith('/p/');
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isApi = url.pathname.startsWith('/api/');
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isApi || isNav) {
    // netwerk-eerst; bij offline val terug op de cache (voor navigatie op de app-shell)
    e.respondWith(
      fetch(req).then((res) => {
        // alleen de app zelf (/, /<taal>/, /p/...) als app-shell bewaren; niet /faq, /privacy enz.
        if (isNav && res && res.ok && isApp(url.pathname)) {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put('/', kopie)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(isNav ? '/' : req))
    );
    return;
  }

  // vaste bestanden: cache-eerst
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
