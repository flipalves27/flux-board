import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportsChartFrame } from "./reports-chart-frame";
import { ReportsEmptyState } from "./reports-empty-state";
import { ReportsErrorState } from "./reports-error-state";
import { ReportsKpiCard } from "./reports-kpi-card";
import { ReportsSectionPlaceholder } from "./reports-section-placeholder";
import { ReportsTabButton } from "./reports-tab-button";
import { ReportsInfoCard } from "./reports-info-card";
import { ReportsLssPanel } from "./reports-lss-panel";
import { ReportsTabBar } from "./reports-tab-bar";
import { ReportsChartHeader } from "./reports-chart-header";
import { ReportsHeatmapCell } from "./reports-heatmap-cell";
import { ReportsGeneratedAt } from "./reports-generated-at";

describe("reports primitives", () => {
  it("renders empty state message", () => {
    render(<ReportsEmptyState message="Sem dados" />);
    expect(screen.getByText("Sem dados")).toBeTruthy();
  });

  it("renders error state title and description", () => {
    render(<ReportsErrorState title="Erro" description="Falha ao carregar" />);
    expect(screen.getByText("Erro")).toBeTruthy();
    expect(screen.getByText("Falha ao carregar")).toBeTruthy();
  });

  it("renders kpi card with label and value", () => {
    render(<ReportsKpiCard label="Boards" value="12" tone="primary" hover />);
    expect(screen.getByText("Boards")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("renders section placeholder message", () => {
    render(<ReportsSectionPlaceholder message="Carregando dependencias..." />);
    expect(screen.getByText("Carregando dependencias...")).toBeTruthy();
  });

  it("renders chart frame with provided height class", () => {
    const { container } = render(
      <ReportsChartFrame heightClassName="h-[260px]">
        <span>Grafico</span>
      </ReportsChartFrame>
    );
    expect(screen.getByText("Grafico")).toBeTruthy();
    expect((container.firstChild as HTMLElement).className.includes("h-[260px]")).toBe(true);
  });

  it("renders tab button and triggers click", () => {
    let clicked = false;
    render(<ReportsTabButton label="Overview" active onClick={() => { clicked = true; }} />);
    const button = screen.getByRole("button", { name: "Overview" });
    button.click();
    expect(clicked).toBe(true);
  });

  it("renders info card with hint", () => {
    render(<ReportsInfoCard title="DoR" value="75%" hint="Percentual pronto" />);
    expect(screen.getByText("DoR")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("Percentual pronto")).toBeTruthy();
  });

  it("renders lss panel with cta link", () => {
    render(<ReportsLssPanel blurb="Lean Six Sigma text" cta="Abrir LSS" href="/pt-BR/reports/lean-six-sigma" />);
    expect(screen.getByText("Lean Six Sigma text")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir LSS" }).getAttribute("href")).toContain("/pt-BR/reports/lean-six-sigma");
  });

  it("renders tab bar and changes selected tab", () => {
    let value: "overview" | "kanban" = "overview";
    const handleChange = (next: "overview" | "kanban") => {
      value = next;
    };
    render(
      <ReportsTabBar
        items={[
          { id: "overview", label: "Overview" },
          { id: "kanban", label: "Kanban" },
        ]}
        value={value}
        onChange={handleChange}
      />
    );
    screen.getByRole("button", { name: "Kanban" }).click();
    expect(value).toBe("kanban");
  });

  it("renders compact tab bar variant", () => {
    const { container } = render(
      <ReportsTabBar
        items={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
        value="a"
        onChange={() => {}}
        compact
      />
    );
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect((container.firstChild as HTMLElement).className.includes("pb-2")).toBe(true);
  });

  it("renders chart header with action button", () => {
    render(<ReportsChartHeader title="Lead time" hint="Weekly trend" action={<button type="button">Action</button>} />);
    expect(screen.getByText("Lead time")).toBeTruthy();
    expect(screen.getByText("Weekly trend")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Action" })).toBeTruthy();
  });

  it("renders heatmap cell data", () => {
    render(<ReportsHeatmapCell name="Board A" risk={80} cardCount={12} background="var(--flux-reports-heat-low)" />);
    expect(screen.getByText("Board A")).toBeTruthy();
    expect(screen.getByText("risco 80 · 12 cards")).toBeTruthy();
  });

  it("renders generated at footer", () => {
    render(<ReportsGeneratedAt label="generatedAt" value="31/03/2026 07:00" />);
    expect(screen.getByText("generatedAt 31/03/2026 07:00")).toBeTruthy();
  });
});

