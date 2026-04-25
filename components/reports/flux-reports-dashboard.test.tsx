import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxReportsDashboard } from "./flux-reports-dashboard";

const apiGetMock = vi.fn();
const replaceMock = vi.fn();
const paramsState = new URLSearchParams();

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/pt-BR/reports",
  useSearchParams: () => paramsState,
}));

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    getHeaders: () => ({}),
  }),
}));

vi.mock("@/context/org-branding-context", () => ({
  usePlatformDisplayName: () => "Flux Board",
}));

vi.mock("@/lib/use-minimum-skeleton-duration", () => ({
  useMinimumSkeletonDuration: () => false,
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  ApiError: class ApiError extends Error {},
}));

vi.mock("recharts", () => {
  const passthrough = ({ children }: { children?: unknown }) => <div>{children as any}</div>;
  return {
    Area: () => null,
    AreaChart: passthrough,
    Bar: () => null,
    BarChart: passthrough,
    CartesianGrid: () => null,
    Legend: () => null,
    Line: () => null,
    LineChart: passthrough,
    ResponsiveContainer: passthrough,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Cell: () => null,
  };
});

vi.mock("./proactive-ai-panel", () => ({ ProactiveAiPanel: () => <div>proactive-panel</div> }));
vi.mock("./sprint-prediction-panel", () => ({ SprintPredictionPanel: () => <div>sprint-prediction</div> }));
vi.mock("./cross-board-dependencies-panel", () => ({ CrossBoardDependenciesPanel: () => <div>dependencies-panel</div> }));
vi.mock("./cfd-accumulated-panel", () => ({ CfdAccumulatedPanel: () => <div>cfd-accumulated-panel</div> }));
vi.mock("./cycle-time-scatter-panel", () => ({ CycleTimeScatterPanel: () => <div>cycle-time-scatter</div> }));
vi.mock("./delivery-forecast-chart", () => ({ DeliveryForecastChart: () => <div>delivery-forecast</div> }));

const basePayload: any = {
  schema: "v1",
  generatedAt: "2026-03-31T00:00:00.000Z",
  aggregates: {
    boardCount: 3,
    boardsWithCards: 3,
    avgRisco: 74,
    avgThroughput: 10,
    avgPrevisibilidade: 82,
    atRiskCount: 1,
    avgLeadTimeDays: 6,
    avgApproxCycleTimeDays: 8,
  },
  cfd: { keys: [], labels: {}, rows: [], note: "note" },
  weeklyThroughput: [{ weekLabel: "W1", concluded: 4 }],
  createdVsDone: [{ weekLabel: "W1", created: 5, concluded: 4 }],
  leadTimeHistogram: [{ label: "1-2d", count: 2 }],
  teamVelocity: [{ name: "Ana", moves: 5 }],
  distribution: {
    byColumn: [{ key: "todo", label: "To do", count: 2 }],
    byPriority: [{ priority: "Alta", count: 1 }],
  },
  portfolioHeatmap: [],
  meta: { copilotHistory: true, boardCount: 3 },
  sprintPrediction: { confidence: 80, risks: [], recommendation: "ok" },
  sentimentHistory: [{ weekLabel: "W1", avgScore: 70, boardCount: 2 }],
  cycleTimeScatter: [],
  blockerTagDistribution: [{ tag: "infra", count: 2 }],
  scrumDorReady: { eligible: 4, ready: 3 },
  sprintStoryPointsHistory: [{ boardId: "b1", boardName: "Board", sprintId: "s1", sprintName: "Sprint 1", endDate: null, completedStoryPoints: 13, goal: "" }],
};

function buildPayload(overrides?: Partial<typeof basePayload>) {
  return {
    ...basePayload,
    ...overrides,
  };
}

describe("FluxReportsDashboard", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    replaceMock.mockReset();
    paramsState.forEach((_, key) => paramsState.delete(key));
  });
  afterEach(() => {
    cleanup();
  });

  it("renders overview by default and switches tabs", async () => {
    apiGetMock.mockResolvedValue(buildPayload());
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.kanban" }));
    await waitFor(() => {
      expect(screen.getAllByText("hub.leadCycleNote").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.scrum" }));
    await waitFor(() => {
      expect(screen.getByText("hub.dorReadyTitle")).toBeTruthy();
    });
  });

  it("renders error state when api fails", async () => {
    apiGetMock.mockRejectedValue(new Error("boom"));
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getAllByText("loadError").length).toBeGreaterThan(0);
    });
  });

  it("switches CFD tab from accumulated to weekly empty state", async () => {
    apiGetMock.mockResolvedValue(buildPayload({ cfd: { keys: [], labels: {}, rows: [], note: "note" } }));
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("cfd-accumulated-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "cfdTabs.weekly" }));
    await waitFor(() => {
      expect(screen.queryByText("cfd-accumulated-panel")).toBeNull();
      expect(screen.getByText("charts.cfd")).toBeTruthy();
      expect(screen.getByText("emptyChart")).toBeTruthy();
    });
  });

  it("renders lss panel when lss tab is selected", async () => {
    apiGetMock.mockResolvedValue(buildPayload());
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.lss" }));
    await waitFor(() => {
      expect(screen.getByText("hub.lssBlurb")).toBeTruthy();
      expect(screen.getByRole("link", { name: "hub.lssCta" })).toBeTruthy();
    });
  });

  it("shows sprint chart empty state when there is no sprint history", async () => {
    apiGetMock.mockResolvedValue(buildPayload({ sprintStoryPointsHistory: [] }));
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.scrum" }));
    await waitFor(() => {
      expect(screen.getByText("hub.sprintVelocityTitle")).toBeTruthy();
      expect(screen.getByText("emptyChart")).toBeTruthy();
    });
  });

  it("navigates through all hub tabs and returns to overview", async () => {
    apiGetMock.mockResolvedValue(buildPayload());
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.kanban" }));
    await waitFor(() => {
      expect(screen.getByText("kpi.avgCycleApprox")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.scrum" }));
    await waitFor(() => {
      expect(screen.getByText("hub.dorReadyTitle")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.lss" }));
    await waitFor(() => {
      expect(screen.getByText("hub.lssBlurb")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "hub.tabs.overview" }));
    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });
  });

  it("shows copilot hint when history is unavailable", async () => {
    apiGetMock.mockResolvedValue(buildPayload({ meta: { copilotHistory: false, boardCount: 3 } }));
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("copilotHint")).toBeTruthy();
    });
  });

  it("applies scope filters and syncs URL", async () => {
    apiGetMock.mockResolvedValue(buildPayload({ meta: { copilotHistory: true, boardCount: 1, availableBoards: [{ id: "b1", name: "Board 1", methodology: "kanban" }] } }));
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/flux-reports", {});
    });

    fireEvent.change(screen.getByLabelText("scope.methodologyLabel"), { target: { value: "kanban" } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      expect(apiGetMock).toHaveBeenLastCalledWith(expect.stringContaining("methodology=kanban"), {});
    });
  });

  it("shows active scope metadata and empty-state coherence", async () => {
    apiGetMock.mockResolvedValue(
      buildPayload({
        meta: {
          copilotHistory: true,
          boardCount: 0,
          scope: { kind: "boards", boardCount: 0, labelHint: "0 selected boards", boardIds: [] },
          availableBoards: [],
        },
      })
    );
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("scope.activeScopeTitle")).toBeTruthy();
      expect(screen.getByText("0 selected boards")).toBeTruthy();
      expect(screen.getByText("scope.emptySelection")).toBeTruthy();
      expect(screen.queryByText("proactive-panel")).toBeNull();
    });
  });

  it("applies catalog preset and keeps it in URL state", async () => {
    apiGetMock.mockResolvedValue(buildPayload());
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("proactive-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /catalog\.weeklyFlowTitle/ }));
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("preset=weekly-flow"));
      expect(apiGetMock).toHaveBeenLastCalledWith(expect.stringContaining("methodology=kanban"), {});
    });
  });

  it("renders heatmap cell and generatedAt footer in overview", async () => {
    apiGetMock.mockResolvedValue(
      buildPayload({
        portfolioHeatmap: [{ boardId: "b-1", name: "Board Heat", risco: 81, throughput: 10, cardCount: 7 }],
      })
    );
    render(<FluxReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Board Heat")).toBeTruthy();
      expect(screen.getByText("risco 81 · 7 cards")).toBeTruthy();
      expect(screen.getByText(/generatedAt/i)).toBeTruthy();
    });
  });
});

