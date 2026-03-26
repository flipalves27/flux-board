import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listPublishedTemplates } from "@/lib/kv-templates";
import type { TemplateCategory } from "@/lib/template-types";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const search = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const catParam = category !== "all" ? (category as TemplateCategory) : undefined;
    let templates = await listPublishedTemplates({ category: catParam, limit: 60 });

    if (search.trim()) {
      const q = search.toLowerCase();
      templates = templates.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
      );
    }

    templates.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ ok: true, templates: templates.slice(0, 50) });
  } catch {
    return NextResponse.json({ ok: true, templates: [] });
  }
}
