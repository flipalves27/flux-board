import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import {
  createCrossDependencyLink,
  deleteCrossDependencyLink,
  listCrossDependencyLinksForOrg,
  listDependencySuggestionsForOrg,
  type CardDependencyEdgeKind,
} from "@/lib/kv-card-dependencies";
import { isMongoConfigured } from "@/lib/mongo";

const KINDS = new Set<CardDependencyEdgeKind>(["depends_on", "blocks", "related_to"]);

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Dependências cross-board requerem MongoDB." }, { status: 501 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    assertFeatureAllowed(org, "portfolio_export");

    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get("boardId") || undefined;
    const cardId = searchParams.get("cardId") || undefined;
    const minConfidence = searchParams.get("minConfidence");
    const minC = minConfidence != null ? Number(minConfidence) : undefined;

    const links = await listCrossDependencyLinksForOrg(payload.orgId, {
      boardId,
      cardId,
      minConfidence: Number.isFinite(minC) ? minC : 0,
    });

    const sugBoardId = searchParams.get("suggestionsBoardId") || boardId;
    const minScore = searchParams.get("minSuggestionScore");
    const ms = minScore != null ? Number(minScore) : 0.85;

    const suggestions = await listDependencySuggestionsForOrg(payload.orgId, {
      boardId: sugBoardId,
      minScore: Number.isFinite(ms) ? ms : 0.85,
      limit: 80,
    });

    return NextResponse.json({
      schema: "flux-board.card_dependencies.v1",
      links,
      suggestions,
    });
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("card-dependencies GET:", err);
    return NextResponse.json({ error: "Erro ao carregar dependências." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Dependências cross-board requerem MongoDB." }, { status: 501 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    assertFeatureAllowed(org, "portfolio_export");

    const body = (await request.json()) as {
      sourceBoardId?: string;
      sourceCardId?: string;
      targetBoardId?: string;
      targetCardId?: string;
      kind?: CardDependencyEdgeKind;
      confidence?: number;
    };

    const sourceBoardId = String(body.sourceBoardId || "").trim();
    const sourceCardId = String(body.sourceCardId || "").trim();
    const targetBoardId = String(body.targetBoardId || "").trim();
    const targetCardId = String(body.targetCardId || "").trim();
    const kind = body.kind;

    if (!sourceBoardId || !sourceCardId || !targetBoardId || !targetCardId || !kind || !KINDS.has(kind)) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    if (sourceBoardId === targetBoardId) {
      return NextResponse.json({ error: "Use dependências entre boards diferentes." }, { status: 400 });
    }

    const okS = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, sourceBoardId);
    const okT = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, targetBoardId);
    if (!okS || !okT) {
      return NextResponse.json({ error: "Sem permissão para um dos boards." }, { status: 403 });
    }

    const sb = await getBoard(sourceBoardId, payload.orgId);
    const tb = await getBoard(targetBoardId, payload.orgId);
    if (!sb || !tb) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

    const sc = Array.isArray(sb.cards) ? sb.cards.find((c) => (c as { id?: string }).id === sourceCardId) : null;
    const tc = Array.isArray(tb.cards) ? tb.cards.find((c) => (c as { id?: string }).id === targetCardId) : null;
    if (!sc || !tc) return NextResponse.json({ error: "Card não encontrado no board." }, { status: 404 });

    const conf =
      typeof body.confidence === "number" && body.confidence >= 0 && body.confidence <= 1 ? body.confidence : 1;

    const created = await createCrossDependencyLink({
      orgId: payload.orgId,
      sourceBoardId,
      sourceCardId,
      targetBoardId,
      targetCardId,
      kind,
      confidence: conf,
      createdByUserId: payload.id,
    });

    if (!created) {
      return NextResponse.json({ error: "Não foi possível criar (duplicado?)." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, link: created });
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("card-dependencies POST:", err);
    return NextResponse.json({ error: "Erro ao criar dependência." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Dependências cross-board requerem MongoDB." }, { status: 501 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    assertFeatureAllowed(org, "portfolio_export");

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId") || "";
    if (!linkId.trim()) {
      return NextResponse.json({ error: "linkId obrigatório." }, { status: 400 });
    }

    const all = await listCrossDependencyLinksForOrg(payload.orgId, { minConfidence: 0 });
    const found = all.find((l) => l._id === linkId);
    if (!found) {
      return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });
    }

    const okS = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, found.sourceBoardId);
    const okT = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, found.targetBoardId);
    if (!okS || !okT) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const removed = await deleteCrossDependencyLink(payload.orgId, linkId);
    if (!removed) {
      return NextResponse.json({ error: "Falha ao remover." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("card-dependencies DELETE:", err);
    return NextResponse.json({ error: "Erro ao remover dependência." }, { status: 500 });
  }
}
