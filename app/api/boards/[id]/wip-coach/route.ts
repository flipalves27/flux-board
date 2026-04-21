import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { buildWipCoachPackage } from "@/lib/wip-coach-suggestions";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config.bucketOrder : [];
  const columns = bucketOrder
    .filter((b): b is { key: string; label: string; wipLimit?: number } => Boolean(b && typeof b === "object" && (b as { key?: string }).key))
    .map((b) => ({
      key: String((b as { key: string }).key),
      label: String((b as { label?: string }).label || (b as { key: string }).key),
      wipLimit: typeof (b as { wipLimit?: number }).wipLimit === "number" ? (b as { wipLimit: number }).wipLimit : undefined,
    }));

  const pack = buildWipCoachPackage(board, columns);
  return NextResponse.json(pack);
}
