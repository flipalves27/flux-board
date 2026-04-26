import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getDocById } from "@/lib/kv-docs";
import { listBoardsForUser } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { logDocsMetric } from "@/lib/docs-metrics";
import type { DocBacklink } from "@/lib/docs-types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const { id: docId } = await params;
  if (!docId?.trim()) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const doc = await getDocById(payload.orgId, docId);
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });

  const started = Date.now();
  const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
  const backlinks: DocBacklink[] = [];

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const boardName = String(board.name || "").trim() || board.id;
    for (const raw of cards) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as { id?: unknown; title?: unknown; docRefs?: unknown };
      const cardId = typeof c.id === "string" ? c.id : "";
      if (!cardId) continue;
      const refs = Array.isArray(c.docRefs) ? c.docRefs : [];
      const hit = refs.some((r) => r && typeof r === "object" && String((r as { docId?: string }).docId) === doc.id);
      if (!hit) continue;
      const cardTitle = typeof c.title === "string" && c.title.trim() ? c.title.trim() : cardId;
      backlinks.push({ boardId: board.id, boardName, cardId, cardTitle });
    }
  }

  logDocsMetric("docs.backlinks", { orgId: payload.orgId, docId: doc.id, count: backlinks.length, latencyMs: Date.now() - started });
  return NextResponse.json({ backlinks });
}
