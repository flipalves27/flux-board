import { describe, expect, it } from "vitest";
import { buildBlockerTagDistribution, scrumDorReadySnapshot } from "./flux-reports-metrics";
import type { BoardData } from "./kv-boards";

describe("flux-reports blockers & DoR", () => {
  it("clusters open cards by first blocker-like tag", () => {
    const boards: BoardData[] = [
      {
        id: "b1",
        name: "B",
        orgId: "o",
        ownerId: "u",
        cards: [
          {
            id: "c1",
            bucket: "x",
            progress: "Em andamento",
            title: "A",
            desc: "",
            priority: "Média",
            tags: ["Bloqueado — aguardando API"],
            order: 0,
          },
          {
            id: "c2",
            bucket: "x",
            progress: "Em andamento",
            title: "B",
            desc: "",
            priority: "Média",
            tags: ["Bloqueado — aguardando API"],
            order: 1,
          },
        ],
        config: { bucketOrder: [{ key: "x", label: "X", color: "var(--flux-primary)" }] },
      } as unknown as BoardData,
    ];
    const dist = buildBlockerTagDistribution(boards);
    expect(dist[0]?.tag).toContain("Bloqueado");
    expect(dist[0]?.count).toBe(2);
  });

  it("counts scrum DoR readiness", () => {
    const boards: BoardData[] = [
      {
        id: "b1",
        name: "S",
        orgId: "o",
        ownerId: "u",
        boardMethodology: "scrum",
        cards: [
          {
            id: "c1",
            bucket: "bk",
            progress: "Não iniciado",
            title: "T",
            desc: "",
            priority: "Média",
            tags: [],
            order: 0,
            dorReady: { titleOk: true, acceptanceOk: true, depsOk: true, sizedOk: true },
          },
        ],
        config: { bucketOrder: [{ key: "bk", label: "Backlog", color: "var(--flux-primary)" }] },
      } as unknown as BoardData,
    ];
    const snap = scrumDorReadySnapshot(boards);
    expect(snap.eligible).toBe(1);
    expect(snap.ready).toBe(1);
  });
});
