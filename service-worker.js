// service-worker.js
// Bei jedem Release zusammen mit APP_VERSION in js/config.js erhöhen
const VERSION = "1.0.11-beta";
const CACHE_NAME = `chronoshift-${VERSION}`;
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./privacy.html",
  "./pico.min.css",
  "./css/app.css",
  "./js/app.js",
  "./js/calendar.js",
  "./js/config.js",
  "./js/data.js",
  "./js/gdrive.js",
  "./js/i18n.js",
  "./js/icons.js",
  "./js/rest.js",
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
  // "reload" umgeht den HTTP-Cache des Browsers, sonst landen ggf. veraltete Dateien im Offline-Cache
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

// Network-first: online immer die aktuelle Version, offline aus dem Cache
self.addEventListener("fetch", (evt) => {
  if (evt.request.method !== "GET") return;
  // Fremde Adressen (Google-Anmeldung, Drive-API) gehen unverändert ans Netz und landen nie im Offline-Cache
  if (new URL(evt.request.url).origin !== self.location.origin) return;
  // GitHub Pages erlaubt dem Browser 10 Minuten HTTP-Cache; "no-cache" fragt trotzdem beim Server nach (meist nur 304).
  // Eigene Request über die URL, weil sich Navigations-Requests nicht mit neuen Optionen kopieren lassen.
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
