import { describe, it, expect } from "vitest";

import { canonicalizeOAuthSessionLandingUrl } from "./canonicalize-oauth-landing-url";

describe("canonicalizeOAuthSessionLandingUrl", () => {
  it("rewrites hostname when shared cookie domain is set", () => {
    expect(
      canonicalizeOAuthSessionLandingUrl("https://oauth-host.example.com/pt-BR/boards", {
        nextPublicAppUrl: "https://www.example.com",
        authCookieDomain: "example.com",
      })
    ).toBe("https://www.example.com/pt-BR/boards");
  });

  it("does not rewrite hostname without AUTH_COOKIE_DOMAIN (host-only session cookies)", () => {
    expect(
      canonicalizeOAuthSessionLandingUrl("https://oauth-host.example.com/pt-BR/boards", {
        nextPublicAppUrl: "https://www.example.com",
        authCookieDomain: "",
      })
    ).toBe("https://oauth-host.example.com/pt-BR/boards");
  });

  it("returns original URL when NEXT_PUBLIC_APP_URL is missing", () => {
    expect(
      canonicalizeOAuthSessionLandingUrl("https://only.example.com/x", {
        authCookieDomain: "example.com",
      })
    ).toBe("https://only.example.com/x");
  });
});
