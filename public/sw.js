const CACHE = 'save-concept-v54';
const ASSETS = ['./index.html', './styles.css', './theme.css', './theme.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './save-concept-vial-signature-v1.webp', './save-concept-vial-back-v1.webp', './login-product-back-v2.webp', './save-concept-mark-v2.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('save-concept-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never store personal responses, administrative pages, or third-party resources.
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || !ASSETS.some(asset => new URL(asset, self.location).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request, { ignoreSearch: true })) || Response.error()));
});
