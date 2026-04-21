import { describe, expect, it } from "vitest";
import {
  REPORTS_CARTESIAN_GRID_STROKE,
  REPORTS_CHART_SERIES_COLORS,
  REPORTS_LSS_CHART_COLORS,
  REPORTS_TOOLTIP_CONTENT_STYLE,
  REPORTS_TOOLTIP_LABEL_STYLE,
} from "./reports-chart-theme";

describe("reports chart theme", () => {
  it("exposes shared tooltip content style contract", () => {
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.background).toBe("var(--bg-card, var(--flux-surface-card))");
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.border).toContain("var(--flux-border-default)");
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.borderRadius).toBe(8);
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.fontSize).toBe(12);
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.color).toBe("var(--flux-text)");
    expect(REPORTS_TOOLTIP_CONTENT_STYLE.boxShadow).toBe("var(--flux-shadow-md)");
  });

  it("exposes shared tooltip label style contract", () => {
    expect(REPORTS_TOOLTIP_LABEL_STYLE.color).toBe("var(--flux-text)");
  });

  it("exposes chart palette tokens for branding-aware series colors", () => {
    expect(REPORTS_CHART_SERIES_COLORS.length).toBe(8);
    expect(REPORTS_CHART_SERIES_COLORS[4]).toBe("var(--flux-primary-on-surface)");
    expect(REPORTS_LSS_CHART_COLORS.length).toBe(5);
    expect(REPORTS_CARTESIAN_GRID_STROKE).toBe("var(--flux-chrome-alpha-06)");
  });
});

