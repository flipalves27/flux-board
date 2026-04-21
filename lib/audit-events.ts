import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import type { AuditResourceType } from "./audit-types";

const COL_AUDIT = "audit_events";

export type { AuditResourceType } from "./audit-types";

export type AuditEventDoc = {
  _id: import("mongodb").ObjectId;
  at: Date;
  action: string;
  resourceType: AuditResourceType;
  actorUserId?: string | null;
  resourceId?: string | null;
  orgId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
};

let auditIndexesEnsured = false;

async function ensureAuditIndexes(db: Db): Promise<void> {
  if (auditIndexesEnsured) return;
  const col = db.collection(COL_AUDIT);
  await col.createIndex({ at: -1 });
  await col.createIndex({ actorUserId: 1, at: -1 });
  await col.createIndex({ resourceType: 1, resourceId: 1, at: -1 });
  auditIndexesEnsured = true;
}

/** Persiste evento de auditoria (MongoDB apenas). */
export async function insertAuditEvent(input: {
  action: string;
  resourceType: AuditResourceType;
  actorUserId?: string | null;
  resourceId?: string | null;
  orgId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    const db = await getDb();
    await ensureAuditIndexes(db);
    const meta = input.metadata ? stripSensitiveMetadata(input.metadata) : undefined;
    await db.collection(COL_AUDIT).insertOne({
      at: new Date(),
      action: input.action,
      resourceType: input.resourceType,
      actorUserId: input.actorUserId ?? null,
      resourceId: input.resourceId ?? null,
      orgId: input.orgId ?? null,
      route: input.route ?? null,
      ...(meta && Object.keys(meta).length ? { metadata: meta } : {}),
      ip: input.ip ?? null,
    });
  } catch (e) {
    console.error("[audit-events] insert failed", e);
  }
}

function stripSensitiveMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const forbidden = new Set(["password", "passwordHash", "token", "accessToken", "refreshToken", "secret"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (forbidden.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export async function listAuditEventsPaginated(params: {
  limit: number;
  cursor?: string | null;
  actorUserId?: string;
  orgId?: string;
  resourceType?: AuditResourceType;
  /** Filtro exato por campo `action` (ex.: org.invite_accepted). */
  action?: string;
  from?: string;
  to?: string;
}): Promise<{ events: AuditEventDoc[]; nextCursor: string | null }> {
  if (!isMongoConfigured()) {
    return { events: [], nextCursor: null };
  }
  const limit = Math.min(Math.max(1, params.limit || 50), 200);
  const db = await getDb();
  await ensureAuditIndexes(db);
  const col = db.collection(COL_AUDIT);

  const filter: Record<string, unknown> = {};
  if (params.actorUserId) filter.actorUserId = params.actorUserId;
  if (params.orgId) filter.orgId = params.orgId;
  if (params.resourceType) filter.resourceType = params.resourceType;
  if (params.action) filter.action = params.action;
  if (params.from || params.to) {
    const at: Record<string, Date> = {};
    if (params.from) at.$gte = new Date(params.from);
    if (params.to) at.$lte = new Date(params.to);
    filter.at = at;
  }
  if (params.cursor) {
    try {
      const { ObjectId } = await import("mongodb");
      filter._id = { $lt: new ObjectId(params.cursor) };
    } catch {
      const { ObjectId } = await import("mongodb");
      filter._id = { $lt: new ObjectId() };
    }
  }

  const docs = await col.find(filter).sort({ _id: -1 }).limit(limit + 1).toArray();
  const hasMore = docs.length > limit;
  const slice = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor =
    hasMore && slice.length ? String(slice[slice.length - 1]._id) : null;
  return {
    events: slice.map((d) => d as unknown as AuditEventDoc),
    nextCursor,
  };
}
