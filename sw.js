// Offline support: everything the reader needs is cached on first visit.
const CACHE = "hafiz13-v2";
const ASSETS = [
  "./", "index.html", "app.css", "app.js", "mushaf.json", "manifest.webmanifest",
  "fonts/indopak.woff2", "fonts/surah-names.woff",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchAndStore(req) {
  return fetch(req).then((res) => {
    if (res.ok && new URL(req.url).origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
}

// The app's own code (page, script, styles) is fetched fresh when online so fixes
// arrive on the next open; everything else (mushaf data, fonts, icons) is cache-first.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const path = new URL(e.request.url).pathname;
  const isShell = e.request.mode === "navigate" || /\.(js|css|html|webmanifest)$/.test(path) || path.endsWith("/");
  e.respondWith(
    isShell
      ? fetchAndStore(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
      : caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetchAndStore(e.request))
  );
});
