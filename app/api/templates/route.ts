import { NextRequest, NextResponse } from "next/server";
import { listPublishedTemplates } from "@/lib/kv-templates";
import type { TemplateCategory } from "@/lib/template-types";
import { TEMPLATE_CATEGORIES } from "@/lib/template-types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("category") || undefined;
  const limit = Number(searchParams.get("limit") || "60");

  const category =
    cat && (TEMPLATE_CATEGORIES as readonly string[]).includes(cat) ? (cat as TemplateCategory) : undefined;

  const templates = await listPublishedTemplates({ category, limit: Number.isFinite(limit) ? limit : 60 });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t._id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      category: t.category,
      pricingTier: t.pricingTier,
      creatorRevenueSharePercent: t.creatorRevenueSharePercent,
      creatorOrgName: t.creatorOrgName,
      createdAt: t.createdAt,
      templateKind: t.snapshot.templateKind ?? "kanban",
    })),
  });
}
