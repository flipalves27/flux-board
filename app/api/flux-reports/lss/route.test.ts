import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: vi.fn(async () => ({ id: "u1", orgId: "o1", isAdmin: true })),
}));
vi.mock("@/lib/kv-users", () => ({ ensureAdminUser: vi.fn(async () => {}) }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn(async () => ({ id: "o1" })) }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(() => {}),
  canUseFeature: vi.fn(() => false),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
  PlanGateError: class PlanGateError extends Error {},
}));
vi.mock("@/lib/api-authz", () => ({ denyPlan: vi.fn(() => new Response("denied", { status: 403 })) }));
vi.mock("@/lib/public-api-error", () => ({ publicApiErrorResponse: vi.fn(() => new Response("err", { status: 500 })) }));
vi.mock("@/lib/kv-okrs", () => ({ listObjectivesWithKeyResults: vi.fn(async () => []) }));
vi.mock("@/lib/quarter-label", () => ({ currentQuarterLabel: vi.fn(() => "Q1 2026") }));
vi.mock("@/lib/kv-boards", () => ({
  getBoardIds: vi.fn(async () => ["lss-1", "lss-2"]),
  getBoardsLssLeanSliceByIds: vi.fn(async () => [
    { id: "lss-1", name: "LSS A", cards: [], config: { bucketOrder: [] }, boardMethodology: "lean_six_sigma" },
    { id: "lss-2", name: "LSS B", cards: [], config: { bucketOrder: [] }, boardMethodology: "lean_six_sigma" },
  ]),
}));
vi.mock("@/lib/flux-reports-lss", () => ({
  buildFluxReportsLssPayload: vi.fn(() => ({ generatedAt: "2026-04-01T00:00:00.000Z", kpis: {} })),
}));

describe("GET /api/flux-reports/lss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns methodology scope by default", async () => {
    const req = new NextRequest("http://localhost/api/flux-reports/lss");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { scope: { kind: string; methodology: string; boardCount: number } } };
    expect(body.meta.scope.kind).toBe("methodology");
    expect(body.meta.scope.methodology).toBe("lean_six_sigma");
    expect(body.meta.scope.boardCount).toBe(2);
  });

  it("returns only effective board ids in board scope", async () => {
    const req = new NextRequest("http://localhost/api/flux-reports/lss?boardIds=lss-2,lss-999");
    const res = await GET(req);
    const body = (await res.json()) as { meta: { scope: { kind: string; boardIds: string[]; boardCount: number } } };
    expect(body.meta.scope.kind).toBe("boards");
    expect(body.meta.scope.boardIds).toEqual(["lss-2"]);
    expect(body.meta.scope.boardCount).toBe(1);
  });
});
