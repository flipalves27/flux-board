import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { COL_ANOMALY_ALERTS } from "@/lib/anomaly-collections";

/**
 * Sino in-app: contagem não lida + últimos alertas (leve).
 */
export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "portfolio_export");
    } catch (err) {
      if (err instanceof PlanGateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    if (!isMongoConfigured()) {
      return NextResponse.json({
        schema: "flux-board.anomaly_alerts_recent.v1",
        mongo: false,
        unreadCount: 0,
        alerts: [],
      });
    }

    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(30, Math.max(1, Number(limitRaw) || 12));

    const db = await getDb();
    const orgId = payload.orgId;

    const [unreadCount, rows] = await Promise.all([
      db.collection(COL_ANOMALY_ALERTS).countDocuments({ orgId, read: false }),
      db
        .collection(COL_ANOMALY_ALERTS)
        .find({ orgId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .project({
          kind: 1,
          severity: 1,
          title: 1,
          message: 1,
          boardId: 1,
          boardName: 1,
          read: 1,
          createdAt: 1,
          suggestedAction: 1,
        })
        .toArray(),
    ]);

    return NextResponse.json({
      schema: "flux-board.anomaly_alerts_recent.v1",
      mongo: true,
      unreadCount,
      alerts: rows.map((a) => ({
        id: a._id instanceof ObjectId ? a._id.toHexString() : String(a._id),
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        message: a.message,
        boardId: a.boardId,
        boardName: a.boardName,
        read: Boolean(a.read),
        createdAt: a.createdAt,
        suggestedAction:
          typeof (a as unknown as { suggestedAction?: unknown }).suggestedAction === "string"
            ? (a as unknown as { suggestedAction: string }).suggestedAction
            : undefined,
      })),
    });
  } catch (e) {
    console.error("[anomaly-alerts/recent]", e);
    return NextResponse.json({ error: "Falha ao carregar alertas" }, { status: 500 });
  }
}
