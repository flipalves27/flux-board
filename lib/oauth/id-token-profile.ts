import "server-only";

import { decodeIdToken, type OAuth2Tokens } from "arctic";

import type { OAuthProviderId } from "@/lib/kv-users";

export type OAuthProfile = {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

/**
 * Extrai perfil OIDC: id_token + userinfo (Graph/Google) para e-mail e flags consistentes.
 */
export async function resolveOAuthProfile(
  provider: OAuthProviderId,
  tokens: OAuth2Tokens
): Promise<OAuthProfile | null> {
  const accessToken = tokens.accessToken();
  const idToken = tokens.idToken();

  let sub = "";
  let email = "";
  let name = "";
  let emailVerified = false;

  if (idToken) {
    const claims = decodeIdToken(idToken) as Record<string, unknown>;
    sub = String(claims.sub ?? "");
    email = String(claims.email ?? "");
    name = String(claims.name ?? claims.preferred_username ?? "");
    emailVerified = Boolean(claims.email_verified);
  }

  const userinfoUrl =
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://graph.microsoft.com/oidc/userinfo";

  const r = await fetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.ok) {
    const u = (await r.json()) as Record<string, unknown>;
    if (u.sub) sub = String(u.sub);
    if (u.email) email = String(u.email);
    if (u.name) name = String(u.name);
    if (u.email_verified !== undefined) {
      emailVerified = Boolean(u.email_verified);
    }
  }

  if (!sub || !email) return null;

  return { sub, email, name, emailVerified };
}
