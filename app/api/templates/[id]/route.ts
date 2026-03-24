import { NextRequest, NextResponse } from "next/server";
import { getPublishedTemplateById, getPublishedTemplateBySlug, deletePublishedTemplate } from "@/lib/kv-templates";
import { getAuthFromRequest } from "@/lib/auth";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Template inválido." }, { status: 400 });

  let tpl = await getPublishedTemplateById(id);
  if (!tpl && !id.startsWith("tpl_")) {
    tpl = await getPublishedTemplateBySlug(id);
  }
  if (!tpl) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });

  return NextResponse.json({
    template: {
      id: tpl._id,
      slug: tpl.slug,
      title: tpl.title,
      description: tpl.description,
      category: tpl.category,
      pricingTier: tpl.pricingTier,
      creatorRevenueSharePercent: tpl.creatorRevenueSharePercent,
      creatorOrgName: tpl.creatorOrgName,
      createdAt: tpl.createdAt,
      templateKind: tpl.snapshot.templateKind ?? "kanban",
      priorityMatrixModel: tpl.snapshot.priorityMatrixModel,
      snapshot: tpl.snapshot,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Template inválido." }, { status: 400 });

  let tpl = await getPublishedTemplateById(id);
  if (!tpl && !id.startsWith("tpl_")) {
    tpl = await getPublishedTemplateBySlug(id);
  }
  if (!tpl) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });

  const canDelete = payload.isAdmin || payload.orgId === tpl.creatorOrgId;
  if (!canDelete) {
    return NextResponse.json({ error: "Sem permissão para excluir este template." }, { status: 403 });
  }

  const ok = await deletePublishedTemplate(tpl._id);
  if (!ok) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
