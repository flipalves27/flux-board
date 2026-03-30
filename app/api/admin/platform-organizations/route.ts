import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { listAllOrganizationsPaginated } from "@/lib/kv-organizations";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    const { searchParams } = request.nextUrl;
    const limit = Number(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor") || undefined;
    const q = searchParams.get("q") || undefined;
    const r = await listAllOrganizationsPaginated({
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: cursor || null,
      q,
    });
    return NextResponse.json(r);
  } catch (err) {
    console.error("platform-organizations GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
