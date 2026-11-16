// Service worker: offline support. Network first, so the app is always up to date when online,
// with the cache as fallback when offline or when the network takes too long.

// Increase together with APP_VERSION in js/config.js on every release; a new version renews the cache
const VERSION = "1.1.9";
const CACHE_NAME = `chronoshift-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
const SLOW_NETWORK_MS = 30000;
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
  "./js/holidays.js",
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
  // Other origins (Google sign-in, Drive API, holiday API) go to the network unchanged and are never cached
  if (new URL(evt.request.url).origin !== self.location.origin) return;
  // GitHub Pages allows 10 minutes of HTTP caching; "no-cache" still checks with the server (usually a 304).
  // A new request from the URL, because navigation requests cannot be copied with new options.
  const network = fetch(new Request(evt.request.url, { cache: "no-cache" })).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, copy));
    }
    return response;
  });
  // A request that is answered from the cache still finishes in the background and renews the cache
  evt.waitUntil(network.catch(() => {}));
  evt.respondWith(networkOrCache(evt.request, network));
});

// With a very weak connection (e.g. in an elevator) a request neither succeeds nor fails for a long time.
// After NETWORK_TIMEOUT_MS the cached file is used; a file that is not cached yet keeps waiting for the network.
// The files of the app load in several steps (page, scripts, their imports, texts). So that not every step waits
// again, the cache is used right away for SLOW_NETWORK_MS after a request ran into the timeout.
let slowUntil = 0;

async function networkOrCache(request, network) {
  const knownSlow = Date.now() < slowUntil;
  const timeout = new Promise((resolve) => setTimeout(resolve, knownSlow ? 0 : NETWORK_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    return caches.match(request);
  }
  if (!knownSlow) slowUntil = Date.now() + SLOW_NETWORK_MS;
  return (await caches.match(request)) ?? network;
}
