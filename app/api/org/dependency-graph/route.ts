import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { listBoardsForUser } from "@/lib/kv-boards";
import { listCrossDependencyLinksForOrg } from "@/lib/kv-card-dependencies";
import { isMongoConfigured } from "@/lib/mongo";

const MAX_NODES = 200;

/**
 * Dados para grafo: nós = cards (com cor por board), arestas = dependências.
 * scope=board: apenas links que tocam boardId. scope=org: todos os links da org (respeitando acesso aos boards).
 */
export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Mapa de dependências requer MongoDB." }, { status: 501 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    assertFeatureAllowed(org, "portfolio_export", planGateCtxForAuth(payload.isAdmin));

    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get("scope") || "board") as "board" | "org";
    const boardId = searchParams.get("boardId") || "";
    const minConfidence = Number(searchParams.get("minConfidence") || "0");
    const minC = Number.isFinite(minConfidence) ? minConfidence : 0;

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const accessible = new Set(boards.map((b) => b.id));

    let links = await listCrossDependencyLinksForOrg(payload.orgId, { minConfidence: minC });

    if (scope === "board") {
      if (!boardId || !accessible.has(boardId)) {
        return NextResponse.json({ error: "boardId inválido ou sem acesso." }, { status: 400 });
      }
      links = links.filter((l) => l.sourceBoardId === boardId || l.targetBoardId === boardId);
    } else {
      links = links.filter((l) => accessible.has(l.sourceBoardId) && accessible.has(l.targetBoardId));
    }

    const nodeIds = new Set<string>();
    const boardOfCard = new Map<string, { boardId: string; cardId: string }>();

    for (const l of links) {
      nodeIds.add(`${l.sourceBoardId}::${l.sourceCardId}`);
      nodeIds.add(`${l.targetBoardId}::${l.targetCardId}`);
      boardOfCard.set(`${l.sourceBoardId}::${l.sourceCardId}`, { boardId: l.sourceBoardId, cardId: l.sourceCardId });
      boardOfCard.set(`${l.targetBoardId}::${l.targetCardId}`, { boardId: l.targetBoardId, cardId: l.targetCardId });
    }

    const boardMeta = new Map(boards.map((b) => [b.id, { name: String(b.name || b.id) }]));
    const cardTitle = (bid: string, cid: string): string => {
      const b = boards.find((x) => x.id === bid);
      const c = Array.isArray(b?.cards) ? b!.cards!.find((raw) => (raw as { id?: string }).id === cid) : null;
      return String((c as { title?: string } | undefined)?.title || cid);
    };

    let nodes = [...nodeIds].map((key) => {
      const { boardId: bid, cardId: cid } = boardOfCard.get(key)!;
      return {
        id: key,
        boardId: bid,
        boardName: boardMeta.get(bid)?.name || bid,
        cardId: cid,
        title: cardTitle(bid, cid),
      };
    });

    if (nodes.length > MAX_NODES) {
      nodes = nodes.slice(0, MAX_NODES);
      const keep = new Set(nodes.map((n) => n.id));
      links = links.filter(
        (l) =>
          keep.has(`${l.sourceBoardId}::${l.sourceCardId}`) && keep.has(`${l.targetBoardId}::${l.targetCardId}`)
      );
    }

    const edges = links.map((l) => ({
      source: `${l.sourceBoardId}::${l.sourceCardId}`,
      target: `${l.targetBoardId}::${l.targetCardId}`,
      kind: l.kind,
      confidence: l.confidence,
    }));

    return NextResponse.json({
      schema: "flux-board.dependency_graph.v1",
      scope,
      nodes,
      edges,
    });
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dependency-graph GET:", err);
    return NextResponse.json({ error: "Erro ao montar grafo." }, { status: 500 });
  }
}
