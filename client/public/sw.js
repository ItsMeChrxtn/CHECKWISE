/*
 * Service worker for the installed app.
 *
 * Two jobs, and deliberately no more. It makes the site installable - Chrome
 * will not offer the install prompt without one - and it keeps the app opening
 * when the network is slow or gone.
 *
 * The caching is split by what the URL promises:
 *
 *   /assets/*  are content-addressed. Vite puts a hash of the contents in every
 *              filename, so a given URL can never mean two different things and
 *              it is safe to serve from cache for ever.
 *
 *   everything the browser navigates to is fetched from the network first, and
 *   only falls back to cache when that fails. A cached index.html would
 *   otherwise pin people to an old build of an app that deploys several times
 *   a day, which is the usual way service workers go wrong.
 *
 * API calls are not touched at all. Stale exam data would be worse than an
 * error, because it looks like data.
 */
const VERSION = "checkwise-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  // Take over as soon as this version is ready rather than waiting for every
  // tab to close, so a fix is one reload away.
  event.waitUntil(caches.open(SHELL).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The API and the scans it serves are never cached.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Offline. The last page that loaded is better than the browser's dinosaur.
    const hit = (await cache.match(request)) || (await cache.match("/"));
    if (hit) return hit;
    throw error;
  }
}
