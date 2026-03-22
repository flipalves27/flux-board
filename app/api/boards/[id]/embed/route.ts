import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { createBoardEmbed } from "@/lib/kv-embed";
import type { EmbedWidgetKind } from "@/lib/kv-embed";

const KINDS: EmbedWidgetKind[] = ["badge", "kanban", "heatmap", "okr"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "Board inválido." }, { status: 400 });

  const can = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!can) return NextResponse.json({ error: "Acesso negado ao board." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const kind = typeof body?.kind === "string" ? body.kind.trim() : "badge";
  if (!KINDS.includes(kind as EmbedWidgetKind)) {
    return NextResponse.json({ error: "kind inválido (badge | kanban | heatmap | okr)." }, { status: 400 });
  }

  const rec = await createBoardEmbed({ boardId, orgId: payload.orgId, kind: kind as EmbedWidgetKind });
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const embedUrl = `${base}/embed/${encodeURIComponent(rec.token)}?kind=${encodeURIComponent(rec.kind)}`;

  return NextResponse.json({
    embed: {
      id: rec._id,
      token: rec.token,
      kind: rec.kind,
      embedUrl,
      iframeSnippet: `<iframe src="${embedUrl}" width="100%" height="420" style="border:0;border-radius:12px" loading="lazy" title="Flux-Board"></iframe>`,
    },
  });
}
