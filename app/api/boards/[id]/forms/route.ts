import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, getBoardRebornId, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { IntakeFormUpsertSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { normalizeFormSlug } from "@/lib/forms-intake";
import { upsertIntakeFormIndex } from "@/lib/kv-intake-forms";

function resolveBoardId(requestedBoardId: string, orgId: string): string {
  if (requestedBoardId !== "b_reborn") return requestedBoardId;
  return getBoardRebornId(orgId);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório." }, { status: 400 });
  }

  const boardId = resolveBoardId(requestedBoardId, payload.orgId);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board." }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  return NextResponse.json({ intakeForm: (board as any).intakeForm ?? null });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório." }, { status: 400 });
  }

  const boardId = resolveBoardId(requestedBoardId, payload.orgId);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board." }, { status: 403 });

  try {
    const body = await request.json();
    const parsed = IntakeFormUpsertSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    const clean = sanitizeDeep(parsed.data);

    const slug = normalizeFormSlug(String(clean.slug || ""));
    if (!slug || slug.length < 3) {
      return NextResponse.json({ error: "Slug inválido (mínimo 3 caracteres)." }, { status: 400 });
    }

    const board = await updateBoard(
      boardId,
      payload.orgId,
      {
      intakeForm: {
        enabled: Boolean(clean.enabled ?? true),
        slug,
        title: String(clean.title || "").trim(),
        description: String(clean.description ?? "").trim() || undefined,
        targetBucketKey: String(clean.targetBucketKey || "").trim(),
        defaultPriority: String(clean.defaultPriority || "Média").trim(),
        defaultProgress: String(clean.defaultProgress || "Não iniciado").trim(),
        defaultTags: Array.isArray(clean.defaultTags) ? clean.defaultTags.map((v) => String(v).trim()).filter(Boolean) : [],
      } as any,
    } as any,
      {
        userId: payload.id,
        userName: payload.username,
        orgId: payload.orgId,
      }
    );

    if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
    await upsertIntakeFormIndex({
      slug,
      boardId,
      orgId: payload.orgId,
      enabled: Boolean((board as any).intakeForm?.enabled ?? true),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, intakeForm: (board as any).intakeForm });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
