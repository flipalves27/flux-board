import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import { hashCacheKey, getAiTextCache, setAiTextCache } from "@/lib/ai-completion-cache";
import { assertOnda4Enabled } from "@/lib/onda4-flags";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import type { BoardFlowSignalPayload } from "@/lib/board-flow-signal";

const CACHE_SEC = 5 * 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  try {
    assertOnda4Enabled(org);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Flow signal indisponível." }, { status });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const rl = await rateLimit({
    key: `flow-signal:${payload.orgId}:${boardId}`,
    limit: 120,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Limite de uso." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const cacheKey = hashCacheKey(["flow_signal", boardId, board.lastUpdated ?? ""]);
  const cached = await getAiTextCache(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as BoardFlowSignalPayload;
      return NextResponse.json({ ...parsed, cached: true });
    } catch {
      /* fall through */
    }
  }

  const portfolio = computeBoardPortfolio(board as unknown as PortfolioBoardLike);
  const wipCards = portfolio.cardCount;

  const body: BoardFlowSignalPayload = {
    boardId,
    generatedAt: new Date().toISOString(),
    health: {
      score: portfolio.risco,
      wipColumns: board.config?.bucketOrder?.length ?? 0,
      wipCards,
    },
    cadence: { label: "Cadência", status: "unknown" },
    workload: { label: "Carga", activeAssignees: new Set((board.cards ?? []).map((c) => (c as { owner?: string }).owner).filter(Boolean)).size },
  };

  await setAiTextCache(cacheKey, JSON.stringify(body), CACHE_SEC);
  return NextResponse.json({ ...body, cached: false });
}
