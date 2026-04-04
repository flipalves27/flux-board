const CACHE_NAME = "flux-board-v6";

/** Não precachear `/` — em muitos hosts redireciona (www, locale) e polui a cache com respostas de redirect. */
const STATIC_ASSETS = ["/offline.html"];

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
   * Não interceptar documentos (top-level navigation). Qualquer `respondWith` aqui expõe o site a
   * bugs do Chrome com redirects (ERR_FAILED / redirect mode manual). O browser trata o HTML sozinho.
   * Push notifications e precache de /offline.html mantêm-se úteis sem isto.
   */
  if (request.mode === "navigate") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // Navegação/documentos podem vir com redirect !== "follow"; sem isso, 302 do app quebra o fetch no SW.
      const fetchPromise = fetch(request, { redirect: "follow" })
        .then((response) => {
          if (
            response.ok &&
            url.origin === self.location.origin &&
            !response.redirected
          ) {
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
