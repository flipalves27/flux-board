import { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n";

const NON_CSP_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // Header legado, mas mantido conforme a proposta.
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

// Observação: este CSP preserva compatibilidade com o seu front atual,
// que usa bastante conteúdo inline (ex.: inline <script>/<style> e handlers).
// Ajustes mais restritivos exigem refatoração do front para remover inline.
const CSP =
  "default-src 'self'; " +
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
  return pathname.startsWith("/embed/");
}

export function middleware(req: NextRequest) {
  const res = intlMiddleware(req);
  const pathname = req.nextUrl.pathname;
  const embed = isEmbedDocumentPath(pathname);

  if (embed) {
    // Permite iframe em sites externos; preferir CSP frame-ancestors (X-Frame-Options some browsers).
    res.headers.delete("X-Frame-Options");
    if (isDocumentRequest(req)) {
      res.headers.set("Content-Security-Policy", "default-src 'self'; frame-ancestors *; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;");
    }
  } else {
    for (const [k, v] of Object.entries(NON_CSP_HEADERS)) {
      res.headers.set(k, v);
    }
    // Aplica CSP apenas para documentos (evita “poluir” recursos como _next/static).
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

// Mantém o middleware rodando para páginas/HTML, mas evita _next/*.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml|api/).*)",
  ],
};

