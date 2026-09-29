// service-worker.js
const CACHE_NAME = "chronoshift-v9";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./pico.min.css",
  "./locales/de.json",
  "./locales/en.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network-first: online immer die aktuelle Version, offline aus dem Cache
self.addEventListener("fetch", (evt) => {
  if (evt.request.method !== "GET") return;
  evt.respondWith(
    fetch(evt.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(evt.request))
  );
});
