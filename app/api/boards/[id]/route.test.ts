import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({
  getBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  userCanAccessBoard: vi.fn(),
  userCanAccessExistingBoard: vi.fn(),
}));
vi.mock("@/lib/kv-board-members", () => ({
  getBoardEffectiveRole: vi.fn(),
  roleCanEdit: vi.fn(),
  roleCanAdmin: vi.fn(),
}));
vi.mock("@/lib/board-put-rbac", () => ({
  boardUpdateRequiresAdmin: vi.fn(),
}));
vi.mock("@/lib/automation-engine", () => ({
  runSyncAutomationsOnBoardPut: vi.fn(),
}));

import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getBoardEffectiveRole, roleCanAdmin, roleCanEdit } from "@/lib/kv-board-members";
import { boardUpdateRequiresAdmin } from "@/lib/board-put-rbac";
import { runSyncAutomationsOnBoardPut } from "@/lib/automation-engine";

const bucketOrder = [
  { key: "backlog", label: "Backlog", color: "#111111" },
  { key: "plan", label: "Planejado", color: "#222222", wipLimit: 10 },
  { key: "done", label: "Concluído", color: "#333333" },
] as const;

function makeCard(i: number, bucket: string, order: number) {
  return {
    id: `c${i}`,
    bucket,
    priority: "Média",
    progress: "Não iniciado",
    title: `Card ${i}`,
    desc: "",
    tags: [] as string[],
    order,
  };
}

describe("PUT /api/boards/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
      username: "user",
    } as never);
    vi.mocked(userCanAccessBoard).mockResolvedValue(true as never);
    vi.mocked(getBoardEffectiveRole).mockResolvedValue("admin" as never);
    vi.mocked(roleCanEdit).mockReturnValue(true);
    vi.mocked(roleCanAdmin).mockReturnValue(true);
    vi.mocked(boardUpdateRequiresAdmin).mockReturnValue(false);
    vi.mocked(runSyncAutomationsOnBoardPut).mockImplementation(async ({ nextCards }) => ({
      cards: nextCards,
      changed: false,
    }));
  });

  it("aceita PUT com cards + config quando a coluna já está acima do WIP (não aplica validateBoardWip estrito ao config)", async () => {
    const prevCards = Array.from({ length: 12 }, (_, i) => makeCard(i, "plan", i));
    const nextCards = [...prevCards];
    [nextCards[0], nextCards[1]] = [nextCards[1], nextCards[0]];
    nextCards.forEach((c, i) => {
      c.order = i;
    });

    const prevBoard = {
      id: "b1",
      name: "Board",
      ownerId: "u1",
      cards: prevCards,
      config: { bucketOrder: [...bucketOrder] },
    };

    vi.mocked(getBoard).mockResolvedValue(prevBoard as never);
    vi.mocked(updateBoard).mockResolvedValue({
      ...prevBoard,
      cards: nextCards,
      lastUpdated: "2020-01-01T00:00:00.000Z",
    } as never);

    const body = {
      cards: nextCards,
      config: { bucketOrder: [...bucketOrder] },
    };

    const req = new NextRequest("http://localhost/api/boards/b1", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean };
    expect(json.ok).toBe(true);
  });

  it("rejeita PUT só com config.bucketOrder quando o board já viola WIP (guarda de configuração)", async () => {
    const prevCards = Array.from({ length: 12 }, (_, i) => makeCard(i, "plan", i));
    const prevBoard = {
      id: "b1",
      name: "Board",
      ownerId: "u1",
      cards: prevCards,
      config: { bucketOrder: [...bucketOrder] },
    };

    vi.mocked(getBoard).mockResolvedValue(prevBoard as never);

    const req = new NextRequest("http://localhost/api/boards/b1", {
      method: "PUT",
      body: JSON.stringify({
        config: { bucketOrder: [...bucketOrder] },
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "b1" }) });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/WIP|wip/i);
    expect(updateBoard).not.toHaveBeenCalled();
  });
});
