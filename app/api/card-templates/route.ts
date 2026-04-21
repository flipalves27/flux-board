import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listCardTemplates, saveCardTemplate, type CardTemplate } from "@/lib/kv-card-templates";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const templates = await listCardTemplates(payload.orgId);
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, title, description, tags, priority, subtasks } = body as Partial<CardTemplate>;

  if (!name?.trim() || !title?.trim()) {
    return NextResponse.json({ error: "Name and title are required." }, { status: 400 });
  }

  const template: CardTemplate = {
    id: `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orgId: payload.orgId,
    name: name.trim(),
    title: title.trim(),
    description: typeof description === "string" ? description : "",
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
    priority: typeof priority === "string" ? priority : "",
    subtasks: Array.isArray(subtasks) ? subtasks.filter((s): s is string => typeof s === "string") : undefined,
    createdBy: payload.id,
    createdAt: new Date().toISOString(),
  };

  await saveCardTemplate(template);
  return NextResponse.json({ template }, { status: 201 });
}
