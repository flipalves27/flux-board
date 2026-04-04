import { describe, expect, it } from "vitest";
import {
  buildFluxReportsLssPayload,
  filterLeanSixSigmaBoards,
  LSS_DMAIC_KEYS,
  LSS_AGING_AT_RISK_DAYS,
} from "./flux-reports-lss";
import type { BoardData } from "./kv-boards";

const dmaicBuckets = LSS_DMAIC_KEYS.map((key, i) => ({
  key,
  label: key,
  color: `var(--c${i})`,
}));

function lssBoard(partial: Partial<BoardData> & { id: string; name: string }): BoardData {
  const { id, name, cards, config, ...rest } = partial;
  return {
    ownerId: "u1",
    orgId: "o1",
    id,
    name,
    boardMethodology: "lean_six_sigma",
    cards: cards ?? [],
    config: config ?? { bucketOrder: dmaicBuckets },
    ...rest,
  };
}

describe("flux-reports-lss", () => {
  it("filters only lean_six_sigma boards", () => {
    const boards: BoardData[] = [
      lssBoard({ id: "a", name: "LSS" }),
      { ...lssBoard({ id: "b", name: "K" }), boardMethodology: "kanban" },
    ];
    expect(filterLeanSixSigmaBoards(boards)).toHaveLength(1);
    expect(filterLeanSixSigmaBoards(boards)[0]?.id).toBe("a");
  });

  it("aggregates open work by DMAIC phase", () => {
    const boards: BoardData[] = [
      lssBoard({
        id: "b1",
        name: "P1",
        cards: [
          { id: "c1", bucket: "define", progress: "Em andamento", createdAt: new Date().toISOString() },
          { id: "c2", bucket: "define", progress: "Em andamento", createdAt: new Date().toISOString() },
          { id: "c3", bucket: "analyze", progress: "Em andamento", createdAt: new Date().toISOString() },
        ],
      }),
    ];
    const payload = buildFluxReportsLssPayload(boards);
    expect(Array.isArray(payload.tagPareto)).toBe(true);
    expect(Array.isArray(payload.individualsSpc)).toBe(true);
    expect(payload.individualsSpcNote).toBeDefined();
    const dist = payload.dmaicOpenDistribution;
    const def = dist.find((d) => d.key === "define");
    const an = dist.find((d) => d.key === "analyze");
    expect(def?.count).toBe(2);
    expect(an?.count).toBe(1);
    expect(payload.totals.openWorkItems).toBe(3);
  });

  it("flags at-risk open items by aging threshold", () => {
    const old = new Date(Date.now() - (LSS_AGING_AT_RISK_DAYS + 3) * 86400000).toISOString();
    const boards: BoardData[] = [
      lssBoard({
        id: "b1",
        name: "P1",
        cards: [{ id: "c1", bucket: "measure", progress: "Em andamento", createdAt: old }],
      }),
    ];
    const payload = buildFluxReportsLssPayload(boards);
    expect(payload.totals.atRiskOpenItems).toBe(1);
    expect(payload.boards[0]?.openAtRiskCount).toBe(1);
  });
});
