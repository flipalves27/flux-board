import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createOrganizationInvite, listOrganizationInvites } from "@/lib/kv-organization-invites";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

  try {
    const inv = await createOrganizationInvite({ orgId: payload.orgId, email });
    return NextResponse.json({
      invite: {
        code: inv._id,
        emailLower: inv.emailLower,
        expiresAt: inv.expiresAt,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const invites = await listOrganizationInvites(payload.orgId);
  return NextResponse.json({ invites });
}

