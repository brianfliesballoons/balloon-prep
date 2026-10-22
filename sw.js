// Balloon Written Prep service worker: lets the app open and work offline after one online visit.
// Network-first for everything it serves (page, JSON, images, PDFs) with a ~3 s timeout that falls back to the cache,
// so a new deploy reaches any online student on their next load. Fonts have fixed names and are served cache-first.
// It never touches cross-origin requests (the instructor Worker included) or anything that is not a GET.
// Bump VERSION when the PRECACHE list changes; old caches are deleted on activate.
const VERSION = 'v1';
const CACHE = 'balloon-prep-' + VERSION;
const PREFIX = 'balloon-prep-';
const TIMEOUT = 3000;
const PRECACHE = [
  './', 'manifest.webmanifest',
  'questions/pilot-1.json', 'questions/pilot-2.json', 'questions/pilot-3.json', 'questions/pilot-4.json', 'questions/pilot-5.json',
  'questions/pilot-6.json', 'questions/pilot-7.json', 'questions/pilot-8.json', 'questions/pilot-9.json', 'questions/kinds.json',
  'lessons/lessons.json', 'lessons/map.json', 'refs/cards.json',
  'refs/img/sectional-legend-8080-1E.png', 'refs/img/phak-fig15-1-airspace-profile.png',
  'fonts/atkinson-hyperlegible-400.woff2', 'fonts/atkinson-hyperlegible-700.woff2',
  'fonts/barlow-semi-condensed-500.woff2', 'fonts/barlow-semi-condensed-600.woff2', 'fonts/barlow-semi-condensed-700.woff2',
  'fonts/ibm-plex-mono-500.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
const ROOT = new URL('./', self.registration.scope).href;

// One cache key per file: no query string, and index.html shares the scope root's entry.
function keyOf(url) {
  const u = new URL(url); u.search = ''; u.hash = '';
  return u.href === ROOT + 'index.html' ? ROOT : u.href;
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(p => {
    const url = new URL(p, ROOT).href;
    // Revalidate with the server so the copy is current; one missing file must not block the rest.
    return fetch(url, { cache: 'no-cache' }).then(r => r.ok ? c.put(keyOf(url), r) : null).catch(() => null);
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(ROOT)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.includes('/fonts/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(e, req));
});

async function cacheFirst(req) {
  const hit = await caches.match(keyOf(req.url), { cacheName: CACHE });
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.status === 200) { const c = await caches.open(CACHE); c.put(keyOf(req.url), r.clone()); }
  return r;
}

function networkFirst(e, req) {
  const key = keyOf(req.url);
  // A byte-range request (a PDF viewer can send one) cannot be stored; ask for the whole file instead.
  const ranged = req.headers.has('range');
  const net = (req.mode === 'navigate' || ranged ? fetch(key, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' }))
    .then(async r => {
      if (r.ok && r.status === 200) { const c = await caches.open(CACHE); await c.put(key, r.clone()); }
      return r;
    });
  e.waitUntil(net.catch(() => {}));
  const fallback = async () => {
    const hit = await caches.match(key, { cacheName: CACHE });
    if (hit) return hit;
    // Offline and opening a page the cache does not hold under this exact URL: give the app itself.
    if (req.mode === 'navigate' && !/\.pdf$/i.test(new URL(key).pathname)) return caches.match(ROOT, { cacheName: CACHE });
  };
  return new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    // Slow link: after TIMEOUT, answer from the cache if it has the file; the network copy still lands in the cache for next time.
    const t = setTimeout(() => fallback().then(finish), TIMEOUT);
    net.then(r => { clearTimeout(t); finish(r); }, async () => {
      clearTimeout(t);
      const hit = await fallback();
      if (hit) finish(hit); else if (!done) { done = true; resolve(Response.error()); }
    });
  });
}
