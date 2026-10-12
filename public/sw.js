// Minimal service worker: makes the portal installable and shows a friendly
// offline screen. Live data is never cached, so the dashboard is always current.
const OFFLINE = "/offline.html";
const CACHE = "thabaal-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // leave data and assets to the network
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
