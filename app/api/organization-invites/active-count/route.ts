import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { countActiveOrganizationInvites } from "@/lib/kv-organization-invites";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const count = await countActiveOrganizationInvites(payload.orgId);
  return NextResponse.json({ activeInvites: count });
}

