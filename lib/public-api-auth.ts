import { NextResponse } from "next/server";
import { findActivePublicApiTokenByKey } from "./public-api-tokens";

export type PublicApiScope =
  | "boards:read"
  | "boards:write"
  | "cards:read"
  | "cards:write"
  | "sprints:read"
  | "sprints:write"
  | "comments:read"
  | "comments:write";

type PublicApiTokenConfig = {
  key: string;
  orgId: string;
  scopes: PublicApiScope[];
};

export type PublicApiAuthOk = {
  ok: true;
  orgId: string;
  scopes: PublicApiScope[];
};

export type PublicApiAuthError = {
  ok: false;
  response: NextResponse;
};

export async function assertPublicApiKey(request: Request): Promise<PublicApiAuthOk | PublicApiAuthError> {
  const key = request.headers.get("x-api-key")?.trim();
  if (key) {
    const dbToken = await findActivePublicApiTokenByKey(key);
    if (dbToken) {
      return { ok: true, orgId: dbToken.orgId, scopes: dbToken.scopes };
    }
  }
  const configuredTokens = parseTokensConfig();

  if (configuredTokens.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Public API v1 not configured.",
          code: "PUBLIC_API_NOT_CONFIGURED",
        },
        { status: 503 }
      ),
    };
  }

  const found = key ? configuredTokens.find((t) => t.key === key) : null;
  if (!found) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid API key.",
          code: "PUBLIC_API_UNAUTHORIZED",
        },
        { status: 401 }
      ),
    };
  }

  return { ok: true, orgId: found.orgId, scopes: found.scopes };
}

export function assertPublicApiScope(
  auth: PublicApiAuthOk,
  required: PublicApiScope
): PublicApiAuthError | null {
  if (auth.scopes.includes(required)) return null;
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "Missing required scope.",
        code: "PUBLIC_API_FORBIDDEN",
      },
      { status: 403 }
    ),
  };
}

function parseTokensConfig(): PublicApiTokenConfig[] {
  const rawJson = process.env.PUBLIC_API_V1_TOKENS_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Array<{
        key?: string;
        orgId?: string;
        scopes?: string[];
      }>;
      return parsed
        .map((x) => ({
          key: String(x.key ?? "").trim(),
          orgId: String(x.orgId ?? "").trim(),
          scopes: normalizeScopes(x.scopes),
        }))
        .filter((x) => x.key && x.orgId);
    } catch {
      return [];
    }
  }

  const legacyKey = process.env.PUBLIC_API_V1_KEY?.trim();
  const legacyOrgId = process.env.PUBLIC_API_V1_ORG_ID?.trim();
  const legacyScopesRaw = process.env.PUBLIC_API_V1_SCOPES?.trim();
  if (!legacyKey || !legacyOrgId) return [];
  const scopes = normalizeScopes(legacyScopesRaw ? legacyScopesRaw.split(",") : undefined);
  return [{ key: legacyKey, orgId: legacyOrgId, scopes }];
}

function normalizeScopes(raw: string[] | undefined): PublicApiScope[] {
  const all: PublicApiScope[] = [
    "boards:read",
    "boards:write",
    "cards:read",
    "cards:write",
    "sprints:read",
    "sprints:write",
    "comments:read",
    "comments:write",
  ];
  if (!Array.isArray(raw) || raw.length === 0) return all;
  const set = new Set(raw.map((x) => String(x).trim() as PublicApiScope));
  return all.filter((s) => set.has(s));
}

