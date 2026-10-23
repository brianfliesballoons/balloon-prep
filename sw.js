// Balloon Written Prep service worker: lets the app open and work offline after one online visit.
// Network-first for everything it serves (page, JSON, images, PDFs) with a ~3 s timeout that falls back to the cache,
// so a new deploy reaches any online student on their next load. Fonts have fixed names and are served cache-first.
// It never touches cross-origin requests (the instructor Worker included) or anything that is not a GET.
// Bump VERSION when the PRECACHE list changes; old caches are deleted on activate.
const VERSION = 'v5';
const CACHE = 'balloon-prep-' + VERSION;
const PREFIX = 'balloon-prep-';
const TIMEOUT = 3000;
const PRECACHE = [
  './', 'manifest.webmanifest',
  'questions/pilot-1.json', 'questions/pilot-2.json', 'questions/pilot-3.json', 'questions/pilot-4.json', 'questions/pilot-5.json',
  'questions/pilot-6.json', 'questions/pilot-7.json', 'questions/pilot-8.json', 'questions/pilot-9.json', 'questions/pilot-10.json', 'questions/kinds.json', 'questions/tracks.json',
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
  const key = keyOf(req.url), url = new URL(key);
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
      if (hit) finish(hit); else if (!done) { done = true; resolve(/\.pdf$/i.test(url.pathname) ? pdfOffline(url) : Response.error()); }
    });
  });
}

// Phone notifications: the instructor answered (sent by the class Worker, see worker/src/push.js).
// Every push shows a notification (iPhone revokes the subscription of a page that receives pushes silently),
// and any open copy of the app is told to reload Your questions.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Your instructor answered', { body: d.body || 'Open the app to read the answer.', tag: d.tag || 'answer', icon: ROOT + 'icons/icon-192.png', data: { url: ROOT + '#learn/questions' } }),
    self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ qa: 'answered' })))
  ]));
});

// Tapping it opens the app at the Learn page's Your questions: an open copy is focused and moved there, otherwise a new window.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || ROOT + '#learn/questions';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(ROOT));
    if (c) { c.postMessage({ qa: 'open' }); return c.focus().catch(() => {}); }
    return self.clients.openWindow(url);
  }));
});

// A card's PDF is not precached (1.8 MB), so one never opened online cannot open offline.
// Instead of the browser's offline error page, say so plainly in the app's style and link back to the card in the app.
function pdfOffline(url) {
  const id = url.pathname.split('/').pop().replace(/\.pdf$/i, '').replace(/[^a-z0-9-]/gi, '');
  const back = ROOT + (id && id !== 'all' ? '#ref=' + id : '#ref');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card needs a connection · Balloon Written Prep</title><meta name="color-scheme" content="light dark">
<style>
@font-face{font-family:"Atkinson Hyperlegible";font-weight:400;font-display:swap;src:url(${ROOT}fonts/atkinson-hyperlegible-400.woff2) format("woff2")}
@font-face{font-family:"Barlow Semi Condensed";font-weight:700;font-display:swap;src:url(${ROOT}fonts/barlow-semi-condensed-700.woff2) format("woff2")}
:root{--bg:#e9efec;--surface:#fbfcfa;--ink:#14263a;--muted:#566775;--line:#c6d2cd;--chip:#e3ebe7}
@media (prefers-color-scheme:dark){:root{--bg:#0e161c;--surface:#15212a;--ink:#e4ecf1;--muted:#94a6b3;--line:#2a3b47;--chip:#1d2c36}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Atkinson Hyperlegible",system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{max-width:520px;margin:8vh auto 0;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px}
h1{font:700 1.4rem/1.15 "Barlow Semi Condensed","Arial Narrow",system-ui,sans-serif;margin:0 0 8px}
p{margin:0 0 12px}.mut{color:var(--muted);font-size:.92rem}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border-radius:7px;border:1px solid var(--line);background:var(--chip);color:var(--ink);text-decoration:none;font:700 .98rem "Barlow Semi Condensed","Arial Narrow",system-ui,sans-serif;letter-spacing:.02em}
a.primary{background:var(--ink);color:var(--surface);border-color:var(--ink)}
</style></head><body><main>
<h1>This card needs a connection the first time</h1>
<p>The printable copy of this card has not been saved on this device yet, and you are offline right now.</p>
<p class="mut">Open it once while you are online and it will open offline after that. You can still read every card in the app.</p>
<div class="row"><a class="primary" href="${back}">Read it in the app</a><a href="${url.href}">Try again</a></div>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
