const CACHE = 'save-concept-v35';
// The portal's images are the .webp copies (~200 KB in all, against ~5 MB of
// PNG) — the same pictures, the PNGs stay in public/ for anything linking them.
const ASSETS = ['./index.html', './styles.css', './modern.css', './theme.css', './theme.js', './app.js', './catalog-data.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './save-concept-vial-signature-v1.webp', './save-concept-vial-back-v1.webp', './login-product-back-v2.webp', './save-concept-mark-v2.webp'];
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

  // Consultas de API precisam sempre de uma resposta atual do servidor.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Somente arquivos públicos conhecidos podem ser armazenados para uso
  // offline (allowlist explícita abaixo) — qualquer outro caminho, incluindo
  // o painel admin, nem é interceptado por este service worker: cai direto
  // para o fetch normal do navegador, então o caminho do admin nunca
  // precisa aparecer, em texto puro, neste arquivo público e legível por
  // qualquer visitante.
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
