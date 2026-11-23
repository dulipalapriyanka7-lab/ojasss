// OJASSS service worker — offline app shell only.
// Never caches API responses, auth, media or any user-specific data.
const VERSION = 'ojasss-shell-v3';
const SPLASH = ['/ojasss-splash.css', '/ojasss-splash.js', '/brand/logo.png'];
const SHELL = ['/', '/offline.html', '/brand/mark.png', ...SPLASH, '/icons/icon-192.png', '/theme-init.js', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ojasss-shell-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API/media/auth go straight to network

  // Navigations: network first, fall back to cached shell, then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) || caches.match('/offline.html')));
    return;
  }
  // Hashed build assets are immutable: cache-first.
  if (SPLASH.includes(url.pathname)) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
