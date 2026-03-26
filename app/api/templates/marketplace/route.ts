import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getAllPublishedTemplates, type PublishedTemplate } from "@/lib/kv-templates";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const search = request.nextUrl.searchParams.get("q") ?? "";

  let templates: PublishedTemplate[] = [];
  try {
    templates = await getAllPublishedTemplates();
  } catch {
    return NextResponse.json({ ok: true, templates: [] });
  }

  if (category !== "all") {
    templates = templates.filter((t) => t.category === category);
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    templates = templates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)
    );
  }

  templates.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));

  return NextResponse.json({ ok: true, templates: templates.slice(0, 50) });
}
