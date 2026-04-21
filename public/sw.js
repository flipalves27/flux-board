const CACHE_NAME = "flux-board-v7";

/** Não precachear `/` — em muitos hosts redireciona (www, locale) e polui a cache com respostas de redirect. */
const STATIC_ASSETS = ["/offline.html"];

/**
 * Pedidos internos do App Router (RSC / flight). Não são `mode: "navigate"`; se o SW os tratar e o
 * `.catch` devolver `undefined`, o Chrome falha com "Failed to convert value to 'Response'".
 * @see next/dist/client/components/app-router-headers.js
 */
function isNextAppRouterDataRequest(request) {
  if (request.headers.get("rsc") === "1") return true;
  if (request.headers.has("next-router-state-tree")) return true;
  if (request.headers.has("next-router-prefetch")) return true;
  if (request.headers.has("next-router-segment-prefetch")) return true;
  if (request.headers.has("next-hmr-refresh")) return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/x-component")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const path of STATIC_ASSETS) {
        try {
          await cache.add(new Request(path, { redirect: "follow" }));
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

  /**
   * Documento top-level: deixar o browser (evita bugs com redirects).
   * Navegação client-side do Next: não é "navigate" — tem header RSC; também ignorar.
   */
  if (request.mode === "navigate") return;
  if (isNextAppRouterDataRequest(request)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request, { redirect: "follow" });
        if (
          response.ok &&
          url.origin === self.location.origin &&
          !response.redirected
        ) {
          const cache = await caches.open(CACHE_NAME);
          void cache.put(request, response.clone());
        }
        return response;
      } catch {
        const offline = await caches.match("/offline.html");
        if (offline) return offline;
        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Flux Board";
  const options = {
    body: data.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
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
