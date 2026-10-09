// Service worker: offline support. Network first, so the app is always up to date when online,
// with the cache as fallback when offline.

// Increase together with APP_VERSION in js/config.js on every release; a new version renews the cache
const VERSION = "1.1.3";
const CACHE_NAME = `chronoshift-${VERSION}`;
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./privacy.html",
  "./pico.min.css",
  "./css/app.css",
  "./js/absence.js",
  "./js/app.js",
  "./js/calendar.js",
  "./js/config.js",
  "./js/data.js",
  "./js/gdrive.js",
  "./js/i18n.js",
  "./js/icons.js",
  "./js/migrate.js",
  "./js/rest.js",
  "./js/settings-nav.js",
  "./js/settings.js",
  "./js/state.js",
  "./js/storage.js",
  "./js/tasks.js",
  "./js/ui.js",
  "./js/util.js",
  "./js/worktime-calc.js",
  "./js/worktime.js",
  "./js/xlsx.js",
  "./locales/de.json",
  "./locales/en.json",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (evt) => {
  // "reload" bypasses the browser's HTTP cache, otherwise outdated files could end up in the offline cache
  const requests = FILES_TO_CACHE.map((url) => new Request(url, { cache: "reload" }));
  evt.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
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

self.addEventListener("fetch", (evt) => {
  if (evt.request.method !== "GET") return;
  // Other origins (Google sign-in, Drive API) go to the network unchanged and are never cached
  if (new URL(evt.request.url).origin !== self.location.origin) return;
  // GitHub Pages allows 10 minutes of HTTP caching; "no-cache" still checks with the server (usually a 304).
  // A new request from the URL, because navigation requests cannot be copied with new options.
  evt.respondWith(
    fetch(new Request(evt.request.url, { cache: "no-cache" }))
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
