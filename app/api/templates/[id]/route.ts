import { NextRequest, NextResponse } from "next/server";
import { getPublishedTemplateById, getPublishedTemplateBySlug } from "@/lib/kv-templates";

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
      snapshot: tpl.snapshot,
    },
  });
}
