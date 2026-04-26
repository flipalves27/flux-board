import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { aggregateAllOrgsForgeStats } from "@/lib/kv-forge";
import { isPlatformAdminSession } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!isPlatformAdminSession(payload)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const stats = await aggregateAllOrgsForgeStats();
  return NextResponse.json({ stats });
}
