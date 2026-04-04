import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getCardTemplate, deleteCardTemplate } from "@/lib/kv-card-templates";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const template = await getCardTemplate(payload.orgId, id);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  return NextResponse.json({ template });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const template = await getCardTemplate(payload.orgId, id);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  await deleteCardTemplate(payload.orgId, id);
  return NextResponse.json({ ok: true });
}
