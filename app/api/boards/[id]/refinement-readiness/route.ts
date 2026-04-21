import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard, type BoardData } from "@/lib/kv-boards";
import {
  computeRefinementReadinessScore,
  type CardRefinementInput,
  type RefinementReadinessResult,
} from "@/lib/card-refinement-readiness";

export const runtime = "nodejs";

function normalizeTitleKey(title: string): string {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
}

function cardToRefinementInput(card: Record<string, unknown>): CardRefinementInput {
  const desc = String(card.desc || "");
  let acceptanceCriteriaText = "";
  const acMatch = desc.match(/(?:critérios?\s+de\s+aceitação|acceptance\s+criteria)[:\s]*([\s\S]{10,2000})/i);
  if (acMatch?.[1]) acceptanceCriteriaText = acMatch[1].trim();

  return {
    title: String(card.title || ""),
    desc,
    priority: card.priority == null ? null : String(card.priority),
    progress: card.progress == null ? null : String(card.progress),
    dueDate: card.dueDate == null ? null : String(card.dueDate),
    tags: Array.isArray(card.tags) ? (card.tags as string[]) : [],
    blockedBy: Array.isArray(card.blockedBy) ? (card.blockedBy as string[]) : [],
    acceptanceCriteriaText: acceptanceCriteriaText || undefined,
    estimatePoints: typeof card.storyPoints === "number" && Number.isFinite(card.storyPoints) ? card.storyPoints : null,
    dorReady:
      card.dorReady && typeof card.dorReady === "object"
        ? (card.dorReady as CardRefinementInput["dorReady"])
        : null,
  };
}

function similarDoneCount(board: BoardData, cardTitle: string, excludeId: string): number {
  const key = normalizeTitleKey(cardTitle);
  if (key.length < 4) return 0;
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let n = 0;
  for (const c of cards) {
    const rec = c as Record<string, unknown>;
    if (String(rec.id) === excludeId) continue;
    const p = String(rec.progress || "");
    if (!["Concluída", "Done", "Closed"].includes(p)) continue;
    if (normalizeTitleKey(String(rec.title || "")) === key) n++;
  }
  return n;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const url = new URL(request.url);
  const cardId = url.searchParams.get("cardId")?.trim();

  if (cardId) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const card = cards.find((c) => String((c as { id?: string }).id) === cardId);
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
    const input = cardToRefinementInput(card as Record<string, unknown>);
    const sim = similarDoneCount(board, input.title, cardId);
    const result = computeRefinementReadinessScore(input, { similarDoneCount: sim });
    return NextResponse.json({ cardId, ...result });
  }

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const items: Array<{ cardId: string } & RefinementReadinessResult> = [];
  for (const c of cards.slice(0, 120)) {
    const rec = c as Record<string, unknown>;
    const id = String(rec.id || "");
    if (!id) continue;
    const input = cardToRefinementInput(rec);
    const sim = similarDoneCount(board, input.title, id);
    const result = computeRefinementReadinessScore(input, { similarDoneCount: sim });
    items.push({ cardId: id, ...result });
  }

  return NextResponse.json({ boardId, items });
}
