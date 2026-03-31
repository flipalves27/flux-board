import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportsTooltip } from "./reports-tooltip";

vi.mock("recharts", () => ({
  Tooltip: ({ contentStyle, labelStyle }: { contentStyle?: Record<string, unknown>; labelStyle?: Record<string, unknown> }) => (
    <div>
      <span>tooltip-mock</span>
      <span>{String(contentStyle?.fontSize)}</span>
      <span>{String(labelStyle?.color ?? "")}</span>
    </div>
  ),
}));

describe("ReportsTooltip", () => {
  it("uses shared tooltip styles", () => {
    render(<ReportsTooltip />);
    expect(screen.getByText("tooltip-mock")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("passes optional label style", () => {
    render(<ReportsTooltip labelStyle={{ color: "var(--flux-text)" }} />);
    expect(screen.getByText("var(--flux-text)")).toBeTruthy();
  });
});

