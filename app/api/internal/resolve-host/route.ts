import { NextRequest, NextResponse } from "next/server";
import { getOrganizationByCustomDomain } from "@/lib/kv-organizations";

function authorize(request: NextRequest): boolean {
  const secret =
    process.env.INTERNAL_HOST_RESOLVE_SECRET || process.env.RATE_LIMIT_INTERNAL_SECRET || process.env.JWT_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const h = request.headers.get("x-internal-host-secret");
  return h === secret;
}

/**
 * Resolve orgId por host (middleware / edge). Protegido por segredo interno.
 * POST { "host": "board.cliente.com" } → { "orgId": "…" } | 404
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const host = String(body?.host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!host) {
    return NextResponse.json({ error: "host obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationByCustomDomain(host);
  if (!org) {
    return NextResponse.json({ orgId: null }, { status: 404 });
  }

  return NextResponse.json({ orgId: org._id });
}
