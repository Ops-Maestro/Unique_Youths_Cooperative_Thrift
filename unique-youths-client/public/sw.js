// Minimal service worker - just enough to satisfy "installable PWA"
// requirements (Chrome/Android and Safari/iOS both require an active
// service worker before they'll offer "Add to Home Screen"/"Install app").
// Deliberately not doing aggressive offline caching here: this app talks to
// a live backend for member data, so serving stale cached API responses
// would be actively misleading (wrong balances, stale announcements).
// It only caches the static app shell so the icon/splash load instantly.

const CACHE_NAME = "uy-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Never intercept API calls - always go to the network so data is fresh.
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
