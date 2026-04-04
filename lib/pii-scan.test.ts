import { describe, expect, it } from "vitest";
import { maskPii, piiRiskLevel, scanPii } from "./pii-scan";

describe("pii-scan", () => {
  it("detects email", () => {
    const f = scanPii("contato fulano@empresa.com.br fim");
    expect(f.some((x) => x.kind === "email")).toBe(true);
  });

  it("masks and assigns risk", () => {
    const text = "Token: sk-abcdefghijklmnopqrstuvwxyz012345";
    const { masked, findings } = maskPii(text);
    expect(findings.length).toBeGreaterThan(0);
    expect(masked).toContain("REDACTED");
    expect(piiRiskLevel(findings)).toBe("high");
  });
});
