import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { ensureAdminUser, listAllUsersPaginated } from "@/lib/kv-users";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    await ensureAdminUser();
    const { searchParams } = request.nextUrl;
    const limit = Number(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor") || undefined;
    const orgId = searchParams.get("orgId") || undefined;
    const q = searchParams.get("q") || undefined;
    const r = await listAllUsersPaginated({
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: cursor || null,
      orgId,
      q,
    });
    return NextResponse.json(r);
  } catch (err) {
    console.error("platform-users GET:", err);
    return publicApiErrorResponse(err, { context: "api/admin/platform-users/route.ts" });
  }
}
