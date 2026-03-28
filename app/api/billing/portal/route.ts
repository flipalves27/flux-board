import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgTeamManager } from "@/lib/api-authz";
import { createPortalSession } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgTeamManager(payload);
  if (denied) return denied;

  try {
    const session = await createPortalSession({ orgId: payload.orgId });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 }
    );
  }
}

