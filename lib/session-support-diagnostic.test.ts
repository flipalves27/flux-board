import { describe, it, expect } from "vitest";

import { buildFluxSessionDiagnosticPayload } from "./session-support-diagnostic";

describe("buildFluxSessionDiagnosticPayload", () => {
  it("builds payload without window", () => {
    const p = buildFluxSessionDiagnosticPayload("ref-1", "no_cookies");
    expect(p.fluxSessionSupportRef).toBe("ref-1");
    expect(p.failureKind).toBe("no_cookies");
    expect(p.origin).toBe("");
    expect(p.pathname).toBe("");
    expect(p.userAgent).toBe("");
    expect(p.capturedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("fills origin from nav when provided", () => {
    const nav = {
      location: { origin: "https://app.example", pathname: "/pt-BR/login" },
      navigator: { userAgent: "TestUA/1" },
    } as unknown as Window;
    const p = buildFluxSessionDiagnosticPayload("ref-2", "token_invalid", nav);
    expect(p.origin).toBe("https://app.example");
    expect(p.pathname).toBe("/pt-BR/login");
    expect(p.userAgent).toBe("TestUA/1");
  });
});
