const CACHE_NAME = "payback-fmunoz-v5";
const ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cachea cada archivo por separado: si uno falla, los demás igual quedan guardados
      // (a diferencia de cache.addAll, que es todo-o-nada).
      Promise.allSettled(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("No se pudo cachear:", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Red primero para librerías externas (PDF/Excel), con caché como respaldo
  if (req.url.includes("cdnjs.cloudflare.com")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Navegación (abrir la app / el ícono instalado): intenta la red primero,
  // y si no hay conexión, sirve el index.html cacheado en vez de fallar.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("./index.html").then((cached) => cached || caches.match(req))
      )
    );
    return;
  }

  // Resto de archivos: caché primero, red como respaldo
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
  );
});
