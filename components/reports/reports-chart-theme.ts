/**
 * Shared Recharts + tooltip styling. All colors are CSS variables so org branding
 * and light/dark themes stay aligned (see app/globals.css).
 */
export const REPORTS_TOOLTIP_CONTENT_STYLE = {
  background: "var(--flux-surface-card)",
  border: "1px solid var(--flux-primary-alpha-25)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--flux-text)",
  boxShadow: "var(--flux-shadow-md)",
} as const;

export const REPORTS_TOOLTIP_LABEL_STYLE = {
  color: "var(--flux-text)",
} as const;

/** Default Cartesian grid stroke — visible on both themes without dominating the chart. */
export const REPORTS_CARTESIAN_GRID_STROKE = "var(--flux-chrome-alpha-06)";

/** Full series palette for multi-series charts (indices wrap with modulo). */
export const REPORTS_CHART_SERIES_COLORS = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-warning-foreground)",
  "var(--flux-danger)",
  "var(--flux-primary-on-surface)",
  "var(--flux-success)",
  "var(--flux-accent-dark)",
  "var(--flux-info)",
] as const;

/** Lean Six Sigma dashboard — distinct hues, same token rules. */
export const REPORTS_LSS_CHART_COLORS = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-warning-foreground)",
  "var(--flux-accent-dark)",
  "var(--flux-success)",
] as const;
