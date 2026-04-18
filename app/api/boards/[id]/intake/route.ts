import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/schemas";
import { pickSimilarCardRefs } from "@/lib/smart-card-enrich";
import { assertOnda4Enabled } from "@/lib/onda4-flags";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const org = await getOrganizationById(payload.orgId);
  try {
    assertOnda4Enabled(org);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Intake indisponível." }, { status });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const rl = await rateLimit({
    key: `intake:${payload.orgId}:${boardId}`,
    limit: 40,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Limite de uso." }, { status: 429 });

  try {
    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.text === "string" ? body.text : typeof body?.content === "string" ? body.content : "";
    const text = sanitizeText(raw).trim().slice(0, 8000);
    if (!text) return NextResponse.json({ error: "text ou content obrigatório" }, { status: 400 });

    const board = await getBoard(boardId, payload.orgId);
    if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

    const title = text.split(/\n+/)[0]?.trim().slice(0, 200) || "Novo card";
    const similar = pickSimilarCardRefs(board.cards ?? [], title, { limit: 8, excludeId: "" });
    const suggestedLinks = similar.map((c) => ({
      cardId: c.id,
      title: c.title.slice(0, 200),
      bucket: c.bucket,
    }));

    return NextResponse.json({
      ok: true,
      draft: {
        title,
        description: text.slice(0, 4000),
        suggestedLinks,
      },
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/boards/[id]/intake/route.ts" });
  }
}
