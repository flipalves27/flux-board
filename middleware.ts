import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { ACCESS_COOKIE } from "@/lib/auth-cookie-names";
import { routing } from "./i18n";

const NON_CSP_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

/** HSTS — reforça HTTPS em clientes (deploy atrás de proxy TLS). */
const HSTS_PROD =
  "max-age=63072000; includeSubDomains; preload";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string, frameAncestors = "'none'"): string {
  return [
    "default-src 'self'",
    // Nonce covers Next.js-injected scripts; unsafe-inline removed for scripts (v6 roadmap).
    `script-src 'self' 'nonce-${nonce}' https://vercel.live`,
    // unsafe-inline needed for React style={{}} props used throughout the app
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "font-src 'self' data: https://fonts.gstatic.com https://vercel.live",
    "img-src 'self' data: https:",
    // allow Vercel edge network and analytics endpoints
    "connect-src 'self' https://vitals.vercel-insights.com https://vercel.live wss://*.pusher.com https://*.pusher.com https://accounts.google.com https://*.googleapis.com",
    `frame-ancestors ${frameAncestors}`,
    // Vercel preview toolbar; OAuth providers may embed consent/account UI in iframes in some flows
    "frame-src https://vercel.live https://accounts.google.com https://login.microsoftonline.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function isDocumentRequest(req: NextRequest) {
  const secFetchDest = req.headers.get("sec-fetch-dest");
  if (secFetchDest === "document") return true;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

/** Primeiro segmento de path com barra inicial (ex. `/boards` → `boards`). */
function firstPathSegment(pathWithLeadingSlash: string): string | null {
  const trimmed = pathWithLeadingSlash.replace(/\/+$/, "") || "/";
  const parts = trimmed.split("/").filter(Boolean);
  return parts[0] ?? null;
}

/**
 * Áreas autenticadas (após locale `pt-BR` | `en`). Não inclui login, portal, embed, forms públicos.
 * Validação JWT fica nas APIs / AuthContext — aqui só evita HTML completo sem cookie de acesso.
 */
const AUTH_DOCUMENT_FIRST_SEGMENTS = new Set([
  "boards",
  "calendar",
  "board",
  "onboarding",
  "onboarding-org",
  "onboarding-invites",
  "org-settings",
  "admin",
  "ai",
  "billing",
  "equipe",
  "users",
  "dashboard",
  "portfolio",
  "tasks",
  "routines",
  "templates",
  "reports",
  "docs",
  "org-audit",
  "sprints",
  "my-work",
  "program-increments",
  "spec-plan",
  "template-marketplace",
  "okrs",
  "org-invites",
  "rate-limit-abuse",
]);

function authDocumentCookieRedirect(req: NextRequest): NextResponse | null {
  if (!isDocumentRequest(req)) return null;
  const pathname = req.nextUrl.pathname;
  if (pathname.includes("/login")) return null;

  let locale: (typeof routing.locales)[number] = routing.defaultLocale;
  let pathAfterLocale = pathname;

  for (const loc of routing.locales) {
    const prefix = `/${loc}`;
    if (pathname === prefix) {
      locale = loc;
      pathAfterLocale = "/";
      break;
    }
    if (pathname.startsWith(`${prefix}/`)) {
      locale = loc;
      pathAfterLocale = pathname.slice(prefix.length) || "/";
      break;
    }
  }

  const seg = firstPathSegment(pathAfterLocale);
  if (!seg || !AUTH_DOCUMENT_FIRST_SEGMENTS.has(seg)) return null;

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (token?.trim()) return null;

  const loginUrl = new URL(`/${locale}/login`, req.url);
  loginUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl, 307);
}

/**
 * Produção: opcionalmente redireciona pedidos HTML de hosts em SITE_HOST_ALIASES
 * para SITE_CANONICAL_ORIGIN (308). Útil para apex → www mantendo ambos no OAuth Console.
 */
/** Redirects permanentes Onda 4 — bookmarks e SEO estáveis (§ compatibilidade URL). */
function tryLegacyAppRouteRedirects(req: NextRequest): NextResponse | null {
  if (!isDocumentRequest(req)) return null;
  const pathname = req.nextUrl.pathname;
  const norm = pathname.replace(/\/+$/, "") || "/";

  const unlocalized: Record<string, { path: string; tabMembros?: boolean }> = {
    "/ai": { path: `/${routing.defaultLocale}/portfolio` },
    "/dashboard": { path: `/${routing.defaultLocale}/portfolio` },
    "/tasks": { path: `/${routing.defaultLocale}/routines` },
    "/users": { path: `/${routing.defaultLocale}/equipe`, tabMembros: true },
  };
  const hit = unlocalized[norm];
  if (hit) {
    const u = new URL(hit.path, req.url);
    req.nextUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));
    if (hit.tabMembros) u.searchParams.set("tab", "membros");
    return NextResponse.redirect(u, 308);
  }

  for (const loc of routing.locales) {
    const prefix = `/${loc}`;
    const pairs: Array<{ from: string; to: string; tabMembros?: boolean }> = [
      { from: `${prefix}/ai`, to: `${prefix}/portfolio` },
      { from: `${prefix}/dashboard`, to: `${prefix}/portfolio` },
      { from: `${prefix}/tasks`, to: `${prefix}/routines` },
      { from: `${prefix}/users`, to: `${prefix}/equipe`, tabMembros: true },
    ];
    for (const { from, to, tabMembros } of pairs) {
      if (norm === from) {
        const u = new URL(to, req.url);
        req.nextUrl.searchParams.forEach((v, k) => u.searchParams.set(k, v));
        if (tabMembros) u.searchParams.set("tab", "membros");
        return NextResponse.redirect(u, 308);
      }
    }
  }
  return null;
}

function tryCanonicalHostRedirect(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  const canonicalRaw = process.env.SITE_CANONICAL_ORIGIN?.trim();
  const aliasesRaw = process.env.SITE_HOST_ALIASES?.trim();
  if (!canonicalRaw || !aliasesRaw || !isDocumentRequest(req)) return null;
  try {
    const canonicalUrl = new URL(canonicalRaw);
    const aliases = new Set(
      aliasesRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const hostHeader = forwarded || req.headers.get("host") || "";
    const host = hostHeader.split(":")[0]!.toLowerCase();
    if (!host || !aliases.has(host)) return null;
    const canonicalHost = canonicalUrl.hostname.toLowerCase();
    if (host === canonicalHost) return null;
    const rawProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (req.nextUrl.protocol === "https:" ? "https" : "http");
    if (rawProto !== "https") return null;
    const dest = new URL(req.nextUrl.pathname + req.nextUrl.search, canonicalUrl.origin);
    return NextResponse.redirect(dest, 308);
  } catch {
    return null;
  }
}

const intlMiddleware = createMiddleware(routing);

function isEmbedDocumentPath(pathname: string) {
  return pathname.includes("/embed/");
}

function applyNonCspSecurityHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(NON_CSP_HEADERS)) {
    res.headers.set(k, v);
  }
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", HSTS_PROD);
  }
  return res;
}

/** Arquivos em `public/` — não passar pelo next-intl (evita 404 tipo `/pt-BR/flux-background.svg` ou `/pt-BR/manifest.json`). */
function isLikelyPublicStaticAsset(pathname: string): boolean {
  if (pathname === "/manifest.json" || pathname === "/sw.js") return true;
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|html|json)$/i.test(pathname);
}

/** Apply security headers to all API responses and pass through to the function. */
function handleApiRequest(_req: NextRequest): NextResponse {
  // Per-endpoint rate limiting is handled inside each API route (lib/rate-limit.ts).
  // Performing an internal HTTP fetch here (to a rate-limit-check endpoint) causes every
  // API call to incur an extra round-trip through Vercel Edge, consistently returning 401
  // and risking Edge Middleware timeout — which shows as "—" (aborted) in Vercel logs.
  return applyNonCspSecurityHeaders(NextResponse.next());
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return handleApiRequest(req);
  }

  const canonicalRedirect = tryCanonicalHostRedirect(req);
  if (canonicalRedirect) return canonicalRedirect;

  const legacyRedirect = tryLegacyAppRouteRedirects(req);
  if (legacyRedirect) return applyNonCspSecurityHeaders(legacyRedirect);

  const authRedirect = authDocumentCookieRedirect(req);
  if (authRedirect) return applyNonCspSecurityHeaders(authRedirect);

  if (isLikelyPublicStaticAsset(pathname)) {
    return applyNonCspSecurityHeaders(NextResponse.next());
  }

  /** Rota legada removida do produto — envia usuários para a lista de boards. */
  if (pathname === "/negocios" || pathname === "/negocios/") {
    return NextResponse.redirect(new URL("/pt-BR/boards", req.url));
  }
  if (pathname === "/pt-BR/negocios" || pathname === "/pt-BR/negocios/") {
    return NextResponse.redirect(new URL("/pt-BR/boards", req.url));
  }
  if (pathname === "/en/negocios" || pathname === "/en/negocios/") {
    return NextResponse.redirect(new URL("/en/boards", req.url));
  }

  const nonce = generateNonce();
  const res = intlMiddleware(req);
  const embed = isEmbedDocumentPath(pathname);

  // Set on response so browser receives it; x-middleware-request-* prefix
  // tells Next.js to forward it as a request header to Server Components,
  // which also causes Next.js to apply the nonce to its own injected <script> tags.
  res.headers.set("x-nonce", nonce);
  res.headers.set("x-middleware-request-x-nonce", nonce);

  if (embed) {
    res.headers.delete("X-Frame-Options");
    if (isDocumentRequest(req)) {
      const csp = buildCsp(nonce, "*");
      if (process.env.NODE_ENV === "production") {
        res.headers.set("Content-Security-Policy", csp);
      } else {
        res.headers.set("Content-Security-Policy-Report-Only", csp);
      }
    }
  } else {
    applyNonCspSecurityHeaders(res);
    if (isDocumentRequest(req)) {
      const csp = buildCsp(nonce);
      if (process.env.NODE_ENV === "production") {
        res.headers.set("Content-Security-Policy", csp);
      } else {
        res.headers.set("Content-Security-Policy-Report-Only", csp);
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|sw\\.js).*)",
  ],
};
