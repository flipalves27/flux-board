import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { deleteDoc, getDocById, updateDoc } from "@/lib/kv-docs";
import { DocUpdateSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const { id } = await params;
  const doc = await getDocById(payload.orgId, id);
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const parsed = DocUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  const clean = sanitizeDeep(parsed.data);
  const { id } = await params;

  const doc = await updateDoc(payload.orgId, id, {
    title: clean.title === undefined ? undefined : String(clean.title),
    parentId: clean.parentId === undefined ? undefined : clean.parentId == null ? null : String(clean.parentId),
    contentMd: clean.contentMd === undefined ? undefined : String(clean.contentMd),
    tags: Array.isArray(clean.tags) ? clean.tags.map((t) => String(t)) : undefined,
  });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const { id } = await params;
  const ok = await deleteDoc(payload.orgId, id);
  if (!ok) return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
