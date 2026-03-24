import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getBoardAutomationRules } from "@/lib/kv-automations";
import { getOrganizationById } from "@/lib/kv-organizations";
import { createPublishedTemplate } from "@/lib/kv-templates";
import {
  buildPriorityMatrixGrid4SnapshotFromBoard,
  buildPriorityMatrixSnapshotFromBoard,
  buildTemplateSnapshotFromBoard,
} from "@/lib/template-snapshot";
import { TemplateExportBodySchema, zodErrorToMessage } from "@/lib/schemas";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Apenas administradores podem publicar templates." }, { status: 403 });

  const { id: boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "Board inválido." }, { status: 400 });

  const can = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!can) return NextResponse.json({ error: "Acesso negado ao board." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = TemplateExportBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  const kind = parsed.data.templateKind ?? "kanban";
  let snapshot;
  if (kind === "priority_matrix") {
    const model = parsed.data.priorityMatrixModel ?? "eisenhower";
    try {
      if (model === "grid4") {
        const gridSel = parsed.data.priorityMatrixGridSelections ?? [];
        snapshot = buildPriorityMatrixGrid4SnapshotFromBoard(board, gridSel);
      } else {
        const selections = parsed.data.priorityMatrixSelections ?? [];
        snapshot = buildPriorityMatrixSnapshotFromBoard(board, selections);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao montar snapshot da matriz.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } else {
    const rules = await getBoardAutomationRules(boardId, payload.orgId);
    snapshot = buildTemplateSnapshotFromBoard(board, rules);
  }
  const org = await getOrganizationById(payload.orgId);

  const tpl = await createPublishedTemplate({
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    category: parsed.data.category,
    pricingTier: parsed.data.pricingTier,
    creatorOrgId: payload.orgId,
    creatorOrgName: org?.name,
    snapshot,
    sourceBoardId: boardId,
    status: "published",
    updatedBy: payload.id,
  });

  return NextResponse.json({
    template: {
      id: tpl._id,
      slug: tpl.slug,
      title: tpl.title,
      category: tpl.category,
      pricingTier: tpl.pricingTier,
    },
  });
}
