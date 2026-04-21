import { NextRequest, NextResponse } from "next/server";

import { getOAuthRequestPublicOrigin } from "./base-url";

export const OAUTH_ERROR_ALLOWLIST_MISCONFIGURED = "oauth_allowlist_misconfigured";
export const OAUTH_ERROR_HOST_NOT_ALLOWED = "oauth_host_not_allowed";

function normalizeToOrigin(urlish: string): string {
  const u = new URL(urlish.trim());
  return u.origin;
}

/**
 * Lê `OAUTH_ALLOWED_PUBLIC_ORIGINS`: CSV de origins ou JSON array de strings.
 * Entradas podem incluir path (usa só `origin`). Falha de parse → `ok: false`.
 * Variável vazia / ausente → `origins: []` (modo lax fora de produção).
 */
export function parseOAuthAllowedPublicOriginsFromEnv():
  | { ok: true; origins: string[] }
  | { ok: false } {
  const raw = process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS?.trim();
  if (!raw) return { ok: true, origins: [] };
  try {
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return { ok: false };
      const strings: string[] = [];
      for (const x of parsed) {
        if (typeof x !== "string" || !x.trim()) return { ok: false };
        strings.push(normalizeToOrigin(x));
      }
      return { ok: true, origins: strings };
    }
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return { ok: true, origins: [] };
    return { ok: true, origins: parts.map((p) => normalizeToOrigin(p)) };
  } catch {
    return { ok: false };
  }
}

function jsonError(error: string, status: 403 | 503): NextResponse {
  return NextResponse.json({ error }, { status });
}

function truncateForLog(s: string, max = 200): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * Em `NODE_ENV === "production"` com OAuth ativo, exige allowlist válida e não vazia
 * e que a origem pública do pedido esteja na lista (espelho do Google/Azure Console).
 * Fora disso não bloqueia (dev / testes sem env).
 */
export function assertOAuthRequestHostAllowed(
  req: NextRequest,
  oauthActive: boolean
): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (!oauthActive) return null;

  const parsed = parseOAuthAllowedPublicOriginsFromEnv();
  if (!parsed.ok) {
    const raw = process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS ?? "";
    console.error("[oauth] OAUTH_ALLOWED_PUBLIC_ORIGINS parse failed", {
      code: OAUTH_ERROR_ALLOWLIST_MISCONFIGURED,
      rawTruncated: truncateForLog(raw),
    });
    return jsonError(OAUTH_ERROR_ALLOWLIST_MISCONFIGURED, 503);
  }
  if (parsed.origins.length === 0) {
    console.error("[oauth] OAUTH_ALLOWED_PUBLIC_ORIGINS empty in production with OAuth active", {
      code: OAUTH_ERROR_ALLOWLIST_MISCONFIGURED,
    });
    return jsonError(OAUTH_ERROR_ALLOWLIST_MISCONFIGURED, 503);
  }

  let requestOrigin: string;
  try {
    requestOrigin = normalizeToOrigin(getOAuthRequestPublicOrigin(req));
  } catch {
    return jsonError(OAUTH_ERROR_HOST_NOT_ALLOWED, 403);
  }

  const allowed = new Set(parsed.origins);
  if (!allowed.has(requestOrigin)) {
    return jsonError(OAUTH_ERROR_HOST_NOT_ALLOWED, 403);
  }
  return null;
}
