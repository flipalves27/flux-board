const CACHE_NAME = "flux-board-v3";
// Only cache offline.html on install; "/" is dynamic and may redirect based on locale
const STATIC_ASSETS = ["/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const path of STATIC_ASSETS) {
        try {
          const response = await fetch(new Request(path, { redirect: "follow" }));
          // Only cache successful responses, not redirects
          if (response.status >= 200 && response.status < 300) {
            await cache.put(path, response.clone());
          }
        } catch {
          /* precache opcional — não bloqueia install */
        }
      }
    })
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
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/")) return;

  // Never cache navigation documents to avoid serving stale authenticated HTML
  // after deployments or session changes.
  // Also don't try to cache responses from navigation requests that may have redirects.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { redirect: "follow" })
        .catch(() => {
          // If fetch fails entirely, try offline page
          return caches.match("/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // Navegação/documentos podem vir com redirect !== "follow"; sem isso, 302 do app quebra o fetch no SW.
      const fetchPromise = fetch(request, { redirect: "follow" })
        .then((response) => {
          // Only cache successful responses (status 200-299) from same origin
          // Avoid caching redirect responses (3xx) which can break subsequent requests
          if (response.status >= 200 && response.status < 300 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("/offline.html"));

      return cached || fetchPromise;
    })
  );
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Flux Board";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
