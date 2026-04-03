import type { NextRequest } from "next/server";

/**
 * CORS para APIs consumidas pelo browser com credenciais same-site ou Bearer cross-origin controlado.
 * Por padrão reflete apenas origens na allowlist (app + opcionais em env).
 */
function parseOriginsList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function appOrigins(): string[] {
  const out = new Set<string>();
  const pub = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (pub) out.add(pub);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) out.add(`https://${vercel.replace(/^https?:\/\//, "")}`);
  for (const o of parseOriginsList(process.env.ALLOWED_CORS_ORIGINS)) {
    out.add(o.replace(/\/$/, ""));
  }
  const list = [...out];
  if (
    list.length === 0 &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.NODE_ENV !== "production"
  ) {
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  }
  return list;
}

/**
 * Se `ALLOW_PUBLIC_BOARDS_CORS=1`, mantém comportamento legado (`*`) para integrações que dependam disso.
 * Caso contrário, ecoa `Origin` apenas se estiver na allowlist.
 */
export function boardsApiCorsHeaders(request: NextRequest): Record<string, string> {
  if (
    process.env.ALLOW_PUBLIC_BOARDS_CORS === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.VERCEL_ENV !== "preview"
  ) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  const origin = request.headers.get("origin");
  const allowed = appOrigins();
  const acao =
    origin && allowed.some((a) => a === origin)
      ? origin
      : allowed.length === 1
        ? allowed[0]
        : "";

  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  if (acao) {
    base["Access-Control-Allow-Origin"] = acao;
  }

  return base;
}
