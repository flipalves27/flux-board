import { describe, expect, it } from "vitest";
import { normalizeSpecDocumentText, truncateSpecText } from "@/lib/spec-plan-text-utils";

describe("spec-plan-text-utils", () => {
  it("truncateSpecText marks truncated when over limit", () => {
    const long = "a".repeat(100);
    const { text, truncated } = truncateSpecText(long, 50);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(50 + 80);
    expect(text).toContain("truncado");
  });

  it("normalize collapses blank lines and trims ends", () => {
    const out = normalizeSpecDocumentText("  a  \n\n\n  b  ");
    expect(out.startsWith("a\n\n")).toBe(true);
    expect(out.endsWith("b")).toBe(true);
  });
});
