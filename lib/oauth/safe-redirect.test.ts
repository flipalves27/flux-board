import { describe, expect, it } from "vitest";

import { sanitizeOAuthReturnPath } from "./safe-redirect";

describe("sanitizeOAuthReturnPath", () => {
  it("allows internal paths", () => {
    expect(sanitizeOAuthReturnPath("/pt-BR/boards")).toBe("/pt-BR/boards");
    expect(sanitizeOAuthReturnPath("/en/board/x")).toBe("/en/board/x");
  });

  it("rejects scheme-relative and absolute", () => {
    expect(sanitizeOAuthReturnPath("//evil.test/path")).toBeUndefined();
    expect(sanitizeOAuthReturnPath("https://evil.test")).toBeUndefined();
    expect(sanitizeOAuthReturnPath("/x\\y")).toBeUndefined();
  });

  it("rejects API routes (not HTML pages)", () => {
    expect(sanitizeOAuthReturnPath("/api/organizations/me")).toBeUndefined();
    expect(sanitizeOAuthReturnPath("/api/foo")).toBeUndefined();
    expect(sanitizeOAuthReturnPath("/apiana")).toBe("/apiana");
  });
});
