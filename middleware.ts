import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n";
import { getClientIpFromHeaders } from "@/lib/client-ip";

const NON_CSP_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

/** HSTS — reforça HTTPS em clientes (deploy atrás de proxy TLS). */
const HSTS_PROD =
  "max-age=63072000; includeSubDomains; preload";

const CSP =
  "default-src 'self'; " +
  "img-src 'self' data: https:; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com;";

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

async function applyApiGlobalRateLimit(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname === "/api/internal/rate-limit-check") {
    return applyNonCspSecurityHeaders(NextResponse.next());
  }

  const secret = process.env.RATE_LIMIT_INTERNAL_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[rate-limit] Defina RATE_LIMIT_INTERNAL_SECRET ou JWT_SECRET para limite global na API.");
    }
    return applyNonCspSecurityHeaders(NextResponse.next());
  }

  let ir: Response;
  try {
    ir = await fetch(new URL("/api/internal/rate-limit-check", req.nextUrl.origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flux-rate-internal": secret,
      },
      body: JSON.stringify({
        pathname: req.nextUrl.pathname,
        method: req.method,
        clientIp: getClientIpFromHeaders(req.headers),
        authHeader: req.headers.get("authorization"),
        cookieHeader: req.headers.get("cookie"),
        cronSecret: req.headers.get("x-cron-secret"),
      }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[rate-limit] fetch interno falhou — fail-open:", e);
    return applyNonCspSecurityHeaders(NextResponse.next());
  }

  if (ir.status === 429) {
    const res = new NextResponse(ir.body, { status: 429 });
    ir.headers.forEach((v, k) => res.headers.set(k, v));
    return applyNonCspSecurityHeaders(res);
  }

  if (ir.status !== 200) {
    // Serviço de rate limit retornou status inesperado — fail-open para não bloquear API.
    console.error("[rate-limit] resposta inesperada do check interno:", ir.status, "— passando requisição adiante.");
    return applyNonCspSecurityHeaders(NextResponse.next());
  }

  const res = NextResponse.next();
  ir.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk.startsWith("x-ratelimit") || lk === "retry-after") {
      res.headers.set(k, v);
    }
  });
  return applyNonCspSecurityHeaders(res);
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return applyApiGlobalRateLimit(req);
  }

  const res = intlMiddleware(req);
  const embed = isEmbedDocumentPath(pathname);

  if (embed) {
    res.headers.delete("X-Frame-Options");
    if (isDocumentRequest(req)) {
      res.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: https:; frame-ancestors *; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
      );
    }
  } else {
    applyNonCspSecurityHeaders(res);
    if (isDocumentRequest(req)) {
      if (process.env.NODE_ENV === "production") {
        res.headers.set("Content-Security-Policy", CSP);
      } else {
        res.headers.set("Content-Security-Policy-Report-Only", CSP);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
