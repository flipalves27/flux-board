import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { listAuditEventsPaginated } from "@/lib/audit-events";
import type { AuditResourceType } from "@/lib/audit-types";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    const { searchParams } = request.nextUrl;
    const limit = Number(searchParams.get("limit") || "50");
    const cursor = searchParams.get("cursor") || undefined;
    const actorUserId = searchParams.get("actorUserId") || undefined;
    const orgId = searchParams.get("orgId") || undefined;
    const resourceType = searchParams.get("resourceType") as AuditResourceType | undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    const r = await listAuditEventsPaginated({
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: cursor || null,
      actorUserId,
      orgId,
      resourceType:
        resourceType === "user" ||
        resourceType === "organization" ||
        resourceType === "auth" ||
        resourceType === "platform" ||
        resourceType === "session"
          ? resourceType
          : undefined,
      from,
      to,
    });

    const events = r.events.map((e) => ({
      id: String(e._id),
      at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
      action: e.action,
      resourceType: (e as { resourceType?: string }).resourceType ?? "platform",
      actorUserId: e.actorUserId ?? undefined,
      resourceId: e.resourceId ?? undefined,
      orgId: e.orgId ?? undefined,
      route: e.route ?? undefined,
      metadata: e.metadata ?? undefined,
      ip: e.ip ?? undefined,
    }));

    return NextResponse.json({ events, nextCursor: r.nextCursor });
  } catch (err) {
    console.error("admin audit GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
