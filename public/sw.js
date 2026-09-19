const CACHE = 'save-concept-v33';
const ASSETS = ['./index.html', './styles.css', './modern.css', './app.js', './catalog-data.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './save-concept-tirzepatide-3d.png', './save-concept-vial-signature-v1.png', './save-concept-vial-back-v1.png', './login-product-back-v2.png', './save-concept-mark-v2.png'];
const assetUrls = new Set(ASSETS.map(asset => new URL(asset, self.location).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('save-concept-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Consultas e páginas administrativas precisam sempre de uma resposta atual do servidor.
  if (url.pathname.startsWith('/api/') || url.pathname === '/usuarios' || url.pathname.startsWith('/usuarios/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Somente arquivos públicos conhecidos podem ser armazenados para uso offline.
  const assetUrl = new URL(url.pathname, url.origin).href;
  if (!assetUrls.has(assetUrl)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && !response.redirected && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(assetUrl, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(assetUrl)) || Response.error()));
});
