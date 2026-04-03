import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
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
    "connect-src 'self' https://vitals.vercel-insights.com https://vercel.live wss://*.pusher.com https://*.pusher.com",
    `frame-ancestors ${frameAncestors}`,
    // allow Vercel live preview toolbar to load in an iframe inside our pages
    "frame-src https://vercel.live",
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
