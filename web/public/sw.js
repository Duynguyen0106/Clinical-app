/* Minimal PWA service worker — caches app shell; audio uploads stay network-first. */
const CACHE = "treow-shell-v1";
const SHELL = ["/", "/login", "/app", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
