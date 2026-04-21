export const OAUTH_COOKIE_GOOGLE = "flux_oauth_google";
export const OAUTH_COOKIE_MICROSOFT = "flux_oauth_ms";

export const OAUTH_SCOPES = ["openid", "profile", "email"] as const;

export type OAuthStartPayload = {
  state: string;
  codeVerifier: string;
  /** Microsoft Entra exige nonce em fluxos OIDC */
  nonce?: string;
  invite?: string;
  redirect?: string;
  /** Locale next-intl, ex.: pt-BR */
  locale: string;
};
