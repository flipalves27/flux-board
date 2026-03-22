import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { revokeOrganizationInvite } from "@/lib/kv-organization-invites";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { code } = await params;
  if (!code) return NextResponse.json({ error: "Código inválido" }, { status: 400 });

  const ok = await revokeOrganizationInvite({ orgId: payload.orgId, code });
  if (!ok) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

