import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById, updateOrganization } from "@/lib/kv-organizations";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

  return NextResponse.json({
    organization: {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      maxUsers: org.maxUsers,
      maxBoards: org.maxBoards,
      createdAt: org.createdAt,
    },
  });
}

export async function PUT(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : undefined;
  const slug = typeof body?.slug === "string" ? body.slug.trim().slice(0, 80) : undefined;

  if (!name && !slug) return NextResponse.json({ error: "Informe `name` ou `slug`." }, { status: 400 });

  try {
    const org = await updateOrganization(payload.orgId, { name, slug });
    if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });
    return NextResponse.json({ organization: org });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 400 });
  }
}

