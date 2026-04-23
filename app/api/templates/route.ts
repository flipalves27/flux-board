import { NextRequest, NextResponse } from "next/server";
import { createPublishedTemplate, listPublishedTemplates } from "@/lib/kv-templates";
import { getAuthFromRequest } from "@/lib/auth";
import type { BoardTemplateSnapshot, TemplateCategory, TemplateLifecycleStatus } from "@/lib/template-types";
import { TEMPLATE_CATEGORIES } from "@/lib/template-types";
import { BoardTemplateSnapshotSchema, zodErrorToMessage } from "@/lib/schemas";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("category") || undefined;
  const statusRaw = searchParams.get("status") || undefined;
  const limit = Number(searchParams.get("limit") || "60");

  const category =
    cat && (TEMPLATE_CATEGORIES as readonly string[]).includes(cat) ? (cat as TemplateCategory) : undefined;

  const status: TemplateLifecycleStatus | undefined =
    statusRaw === "draft" || statusRaw === "published" || statusRaw === "archived" ? statusRaw : undefined;
  const templates = await listPublishedTemplates({ category, status, limit: Number.isFinite(limit) ? limit : 60 });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t._id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      category: t.category,
      pricingTier: t.pricingTier,
      creatorRevenueSharePercent: t.creatorRevenueSharePercent,
      creatorOrgId: t.creatorOrgId,
      creatorOrgName: t.creatorOrgName,
      createdAt: t.createdAt,
      status: t.status ?? "published",
      version: t.version ?? 1,
      templateKind: t.snapshot.templateKind ?? "kanban",
      priorityMatrixModel: t.snapshot.priorityMatrixModel,
      boardMethodology: t.snapshot.boardMethodology ?? null,
    })),
  });
}

const TemplateCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(""),
  category: z.enum(TEMPLATE_CATEGORIES),
  pricingTier: z.enum(["free", "premium"]).optional().default("free"),
  snapshot: BoardTemplateSnapshotSchema,
});

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = TemplateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }
  const doc = await createPublishedTemplate({
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    pricingTier: parsed.data.pricingTier,
    creatorOrgId: payload.orgId,
    snapshot: parsed.data.snapshot as unknown as BoardTemplateSnapshot,
    status: "draft",
    updatedBy: payload.id,
  });
  return NextResponse.json({
    template: {
      id: doc._id,
      slug: doc.slug,
      title: doc.title,
      status: doc.status ?? "draft",
      version: doc.version ?? 1,
    },
  });
}
