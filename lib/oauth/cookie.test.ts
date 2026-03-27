import { describe, expect, it } from "vitest";

import { parseOAuthStartCookie } from "./cookie";

describe("parseOAuthStartCookie", () => {
  it("parses valid JSON payload", () => {
    const raw = JSON.stringify({
      state: "st",
      codeVerifier: "cv",
      locale: "pt-BR",
      invite: "abc",
    });
    expect(parseOAuthStartCookie(raw)).toEqual({
      state: "st",
      codeVerifier: "cv",
      locale: "pt-BR",
      invite: "abc",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseOAuthStartCookie("{")).toBeNull();
  });

  it("returns null when required fields missing", () => {
    expect(parseOAuthStartCookie(JSON.stringify({ state: "x" }))).toBeNull();
  });
});
