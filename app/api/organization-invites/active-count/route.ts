import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { countActiveOrganizationInvites } from "@/lib/kv-organization-invites";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const count = await countActiveOrganizationInvites(payload.orgId);
  return NextResponse.json({ activeInvites: count });
}

