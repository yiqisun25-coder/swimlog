// 游泳日记 service worker
// Bump CACHE when the shell changes so old caches are dropped.
const CACHE = 'swimlog-v1';

const SHELL = [
  '17.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

const CDN = [
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Shell must all succeed; CDN files are best-effort so a blocked CDN
    // never fails the whole install.
    await c.addAll(SHELL);
    await Promise.allSettled(CDN.map(u => c.add(new Request(u, { mode: 'no-cors' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache the record store or the AI endpoint — these must be live,
  // and stale swim data would be worse than an honest failure.
  if (/api\.jsonbin\.io|api\.groq\.com/.test(url.hostname)) return;

  // App shell and same-origin files: network first so updates land as soon
  // as there is a connection, cache as the offline fallback.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await caches.match(req);
        if (hit) return hit;
        // A navigation with nothing cached for it still gets the app shell.
        if (req.mode === 'navigate') {
          const shell = await caches.match('17.html');
          if (shell) return shell;
        }
        throw err;
      }
    })());
    return;
  }

  // CDN assets: cache first, they are version-pinned and never change.
  if (CDN.some(u => req.url.startsWith(u.split('?')[0])) || /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.hostname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res) (await caches.open(CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
  }
});
