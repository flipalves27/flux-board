import { describe, expect, it } from "vitest";
import { REPORTS_TOOLTIP_CONTENT_STYLE, REPORTS_TOOLTIP_LABEL_STYLE } from "./reports-chart-theme";

describe("reports chart theme", () => {
  it("exposes shared tooltip content style contract", () => {
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.background).toBe("var(--flux-surface-card)");
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.border).toContain("var(--flux-primary-alpha-25)");
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.borderRadius).toBe(8);
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.fontSize).toBe(12);
  });

  it("exposes shared tooltip label style contract", () => {
    expect(REPORTS_TOOLTIP_LABEL_STYLE.color).toBe("var(--flux-text)");
  });
});

