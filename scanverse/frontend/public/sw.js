// ScanVerse service worker.
//
// Strategy: network-first for page navigations, stale-while-revalidate for
// everything else. The HTML shell must ALWAYS come from the network so users
// get the latest index.html (which references the current content-hashed
// bundles); asset bundles themselves are immutable and safe to cache.
//
// CACHE_NAME must be bumped whenever this file's behavior changes so the
// activate handler purges old caches.
const CACHE_NAME = "scanverse-shell-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API calls or uploaded media — always go to network so
  // documents/scans stay current and auth stays correct.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
    return;
  }

  // Page navigations: always try the network first. This is what keeps users
  // on the latest deployment instead of a stale cached shell. The cache is
  // only a fallback for offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (hashed bundles), manifest, icons: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
