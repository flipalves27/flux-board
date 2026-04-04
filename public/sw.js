const CACHE_NAME = "flux-board-v5";

/** Não precachear `/` — em muitos hosts redireciona (www, locale) e polui a cache com respostas de redirect. */
const STATIC_ASSETS = ["/offline.html"];

/**
 * Pedidos `navigate` chegam com redirect mode `manual`. Se o SW devolve uma Response com
 * `redirected === true` (ex.: após seguir 302 no fetch interno), o Chrome falha com
 * "redirected response was used for a request whose redirect mode is not 'follow'" e ERR_FAILED.
 */
async function navigationResponseNoRedirectFlag(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
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

  // Never cache navigation documents to avoid serving stale authenticated HTML
  // after deployments or session changes.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request, { redirect: "follow" });
          return await navigationResponseNoRedirectFlag(res);
        } catch {
          const offline = await caches.match("/offline.html");
          return offline || Response.error();
        }
      })()
    );
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
