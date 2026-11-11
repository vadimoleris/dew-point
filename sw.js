/* Точка росы — сервис-воркер. При изменении кода подними VERSION. */
const VERSION = '1.0.1';
const CACHE = 'dewpoint-v' + VERSION;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './icons.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* Удаляем ТОЛЬКО свои кэши — на общем origin живут кэши соседних PWA */
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('dewpoint-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Страница и манифест: сеть → кэш. Идентичность приложения не должна залежаться. */
async function networkFirst(e, req) {
  const cache = await caches.open(CACHE);
  const isNav = req.mode === 'navigate';
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      e.waitUntil(cache.put(isNav ? './index.html' : req, res.clone()).catch(() => {}));
    }
    return res;
  } catch (_) {
    if (isNav) {
      return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
    }
    return (await cache.match(req)) || Response.error();
  }
}

/* Остальное: мгновенно из кэша + фоновое обновление. */
async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then(res => {
      if (res && res.ok) e.waitUntil(cache.put(req, res.clone()).catch(() => {}));
      return res;
    })
    .catch(() => null);
  if (hit) { e.waitUntil(refresh); return hit; }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const critical = req.mode === 'navigate' || url.pathname.endsWith('/manifest.webmanifest');
  e.respondWith(critical ? networkFirst(e, req) : staleWhileRevalidate(e, req));
});
