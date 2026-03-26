import { NextRequest, NextResponse } from "next/server";
import {
  deletePublishedTemplate,
  getPublishedTemplateById,
  getPublishedTemplateBySlug,
  publishTemplate,
  updatePublishedTemplate,
} from "@/lib/kv-templates";
import { getAuthFromRequest } from "@/lib/auth";
import type { BoardTemplateSnapshot } from "@/lib/template-types";
import { BoardTemplateSnapshotSchema, zodErrorToMessage } from "@/lib/schemas";
import { z } from "zod";

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
      status: tpl.status ?? "published",
      version: tpl.version ?? 1,
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

const TemplateUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    category: z
      .enum(["sales", "operations", "projects", "hr", "marketing", "customer_success", "support", "insurance_warranty"])
      .optional(),
    pricingTier: z.enum(["free", "premium"]).optional(),
    snapshot: BoardTemplateSnapshotSchema.optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined ||
      d.description !== undefined ||
      d.category !== undefined ||
      d.pricingTier !== undefined ||
      d.snapshot !== undefined,
    { message: "Informe ao menos um campo para atualizar." }
  );

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  let tpl = await getPublishedTemplateById(id);
  if (!tpl && !id.startsWith("tpl_")) tpl = await getPublishedTemplateBySlug(id);
  if (!tpl) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  if (!payload.isAdmin && payload.orgId !== tpl.creatorOrgId) {
    return NextResponse.json({ error: "Sem permissão para editar este template." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = TemplateUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  const patch: {
    title?: string;
    description?: string;
    category?: "sales" | "operations" | "projects" | "hr" | "marketing" | "customer_success" | "support" | "insurance_warranty";
    pricingTier?: "free" | "premium";
    snapshot?: BoardTemplateSnapshot;
    updatedAt: string;
    updatedBy: string;
  } = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    ...(parsed.data.pricingTier !== undefined ? { pricingTier: parsed.data.pricingTier } : {}),
    ...(parsed.data.snapshot !== undefined
      ? { snapshot: parsed.data.snapshot as unknown as BoardTemplateSnapshot }
      : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: payload.id,
  };
  const updated = await updatePublishedTemplate(tpl._id, {
    ...patch,
  });
  if (!updated) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, template: { id: updated._id, status: updated.status ?? "published" } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  let tpl = await getPublishedTemplateById(id);
  if (!tpl && !id.startsWith("tpl_")) tpl = await getPublishedTemplateBySlug(id);
  if (!tpl) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  if (!payload.isAdmin && payload.orgId !== tpl.creatorOrgId) {
    return NextResponse.json({ error: "Sem permissão para publicar este template." }, { status: 403 });
  }
  const next = await publishTemplate(tpl._id, payload.id);
  if (!next) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, template: { id: next._id, status: next.status, version: next.version } });
}
