import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { listAuditEventsPaginated } from "@/lib/audit-events";
import type { AuditResourceType } from "@/lib/audit-types";
import { isMongoConfigured } from "@/lib/mongo";
import { getUserById } from "@/lib/kv-users";
import { ORG_INVITE_ACCEPTED_AUDIT_ACTION } from "@/lib/invite-audit";

function parseActionParam(raw: string | null): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  if (!/^[\w.]+$/.test(t)) return undefined;
  return t;
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const mongoConfigured = isMongoConfigured();
  if (!mongoConfigured) {
    return NextResponse.json({
      events: [],
      nextCursor: null,
      mongoConfigured: false,
    });
  }

  try {
    const { searchParams } = request.nextUrl;
    const limit = Number(searchParams.get("limit") || "40");
    const cursor = searchParams.get("cursor") || undefined;
    const actionParam = parseActionParam(searchParams.get("action"));
    const resourceType = searchParams.get("resourceType") as AuditResourceType | undefined;
    let auditAction: string | undefined;
    if (!actionParam || actionParam === "all") auditAction = undefined;
    else if (actionParam === "invites") auditAction = ORG_INVITE_ACCEPTED_AUDIT_ACTION;
    else auditAction = actionParam;

    const r = await listAuditEventsPaginated({
      limit: Number.isFinite(limit) ? limit : 40,
      cursor: cursor || null,
      orgId: payload.orgId,
      action: auditAction,
      resourceType:
        resourceType === "user" ||
        resourceType === "organization" ||
        resourceType === "auth" ||
        resourceType === "platform" ||
        resourceType === "session"
          ? resourceType
          : undefined,
    });

    const orgId = payload.orgId;
    const actorIds = [...new Set(r.events.map((e) => e.actorUserId).filter(Boolean))] as string[];
    const actorNames = new Map<string, string>();
    await Promise.all(
      actorIds.map(async (id) => {
        const u = await getUserById(id, orgId);
        if (u?.name?.trim()) actorNames.set(id, u.name.trim());
      })
    );

    const events = r.events.map((e) => ({
      id: String(e._id),
      at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
      action: e.action,
      resourceType: (e as { resourceType?: string }).resourceType ?? "platform",
      actorUserId: e.actorUserId ?? undefined,
      actorName: e.actorUserId ? actorNames.get(e.actorUserId) : undefined,
      resourceId: e.resourceId ?? undefined,
      orgId: e.orgId ?? undefined,
      route: e.route ?? undefined,
      metadata: e.metadata ?? undefined,
      ip: e.ip ?? undefined,
    }));

    return NextResponse.json({
      events,
      nextCursor: r.nextCursor,
      mongoConfigured: true,
    });
  } catch (err) {
    console.error("organization-audit GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
