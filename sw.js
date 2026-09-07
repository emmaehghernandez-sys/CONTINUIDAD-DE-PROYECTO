/* Service worker — actualiza siempre a lo último cuando hay internet,
   y guarda una copia para funcionar sin conexión. */
const CACHE = 'mividav1-v4';
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Nunca tocar las llamadas a la API de Claude
  if (url.hostname.includes('anthropic.com')) return;

  // Solo archivos de la propia app: red primero (para ver siempre lo último),
  // y si no hay internet, usar la copia guardada.
  if (url.origin === location.origin) {
    e.respondWith(
      // 'no-store' evita el caché del navegador → siempre baja la última versión con internet
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
  }
});
