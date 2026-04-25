import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: vi.fn(async () => ({ id: "u1", orgId: "o1", isAdmin: true })),
}));
vi.mock("@/lib/kv-users", () => ({ ensureAdminUser: vi.fn(async () => {}) }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn(async () => ({ id: "o1" })) }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(() => {}),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
  PlanGateError: class PlanGateError extends Error {},
}));
vi.mock("@/lib/api-authz", () => ({ denyPlan: vi.fn(() => new Response("denied", { status: 403 })) }));
vi.mock("@/lib/public-api-error", () => ({ publicApiErrorResponse: vi.fn(() => new Response("err", { status: 500 })) }));
vi.mock("@/lib/mongo", () => ({ getDb: vi.fn(), isMongoConfigured: vi.fn(() => false) }));
vi.mock("@/lib/kv-card-dependencies", () => ({ listDependencySuggestionsForOrg: vi.fn(async () => []) }));
vi.mock("@/lib/flux-api-phase-log", () => ({ logFluxApiPhase: vi.fn() }));
vi.mock("@/lib/board-weekly-sentiment", () => ({
  ensureBoardWeeklySentimentIndexes: vi.fn(),
  listOrgSentimentHistory: vi.fn(async () => []),
}));
vi.mock("@/lib/portfolio-export-core", () => ({
  boardsToPortfolioRows: vi.fn((boards: Array<{ id: string }>) => boards),
  aggregatePortfolio: vi.fn(() => ({
    boardCount: 1,
    boardsWithCards: 1,
    avgRisco: 80,
    avgThroughput: 5,
    avgPrevisibilidade: 90,
    atRiskCount: 0,
  })),
}));
vi.mock("@/lib/kv-boards", () => ({
  getBoardIds: vi.fn(async () => ["b-kanban", "b-scrum"]),
  getBoardsFluxReportsSliceByIds: vi.fn(async () => [
    { id: "b-kanban", name: "Kanban A", boardMethodology: "kanban", cards: [], config: { bucketOrder: [] } },
    { id: "b-scrum", name: "Scrum B", boardMethodology: "scrum", cards: [], config: { bucketOrder: [] } },
  ]),
}));
vi.mock("@/lib/flux-reports-sprint-metrics", () => ({ buildSprintStoryPointsHistory: vi.fn(async () => []) }));
vi.mock("@/lib/sprint-prediction-metrics", () => ({ buildSprintPredictionPayload: vi.fn(() => ({ confidence: 0, risks: [] })) }));
vi.mock("@/lib/flux-reports-metrics", () => ({
  averageApproxCycleTimeDays: vi.fn(() => 0),
  averageLeadTimeDays: vi.fn(() => 0),
  buildBlockerTagDistribution: vi.fn(() => []),
  buildCfdPoints: vi.fn(() => []),
  buildColumnAndPriorityDistribution: vi.fn(() => ({ byColumn: [], byPriority: [] })),
  buildCreatedVsDoneFromCopilot: vi.fn(() => []),
  buildCycleTimeScatterPoints: vi.fn(() => []),
  buildLeadTimeHistogram: vi.fn(() => []),
  buildPortfolioHeatmap: vi.fn(() => []),
  buildRollingWeekRanges: vi.fn((n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `W${i + 1}`, startMs: i * 10, endMs: i * 10 + 9 }))
  ),
  buildTeamVelocity: vi.fn(() => []),
  buildWeeklyThroughputFromCopilot: vi.fn(() => []),
  collectBucketLabels: vi.fn(() => new Map()),
  scrumDorReadySnapshot: vi.fn(() => ({ eligible: 0, ready: 0 })),
}));

describe("GET /api/flux-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns scoped meta for methodology filter", async () => {
    const req = new NextRequest("http://localhost/api/flux-reports?methodology=kanban");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { scope: { kind: string; methodology?: string; boardCount: number } } };
    expect(body.meta.scope.kind).toBe("methodology");
    expect(body.meta.scope.methodology).toBe("kanban");
    expect(body.meta.scope.boardCount).toBe(1);
  });

  it("returns scoped meta for explicit board ids", async () => {
    const req = new NextRequest("http://localhost/api/flux-reports?boardIds=b-scrum,b-missing");
    const res = await GET(req);
    const body = (await res.json()) as { meta: { scope: { kind: string; boardIds?: string[]; boardCount: number } } };
    expect(body.meta.scope.kind).toBe("boards");
    expect(body.meta.scope.boardIds).toEqual(["b-scrum"]);
    expect(body.meta.scope.boardCount).toBe(1);
  });
});
