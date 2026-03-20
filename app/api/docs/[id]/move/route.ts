import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { moveDoc } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature } from "@/lib/plan-gates";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs")) return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { parentId?: string | null };
  const parentId = body.parentId === undefined ? null : body.parentId === null ? null : String(body.parentId || "").trim() || null;
  const { id } = await params;
  const doc = await moveDoc(payload.orgId, id, parentId);
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  return NextResponse.json({ doc });
}
