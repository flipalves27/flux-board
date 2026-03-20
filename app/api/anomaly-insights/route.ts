import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { COL_ANOMALY_ALERTS, COL_ANOMALY_RUNS } from "@/lib/anomaly-service";

/**
 * Painel “Proactive AI”: histórico de execuções e alertas persistidos.
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
        schema: "flux-board.anomaly_insights.v1",
        mongo: false,
        runs: [],
        alerts: [],
        unreadCount: 0,
        health: { status: "no_data" as const, lastRunAt: null as string | null },
      });
    }

    const db = await getDb();
    const orgId = payload.orgId;

    const [runs, alerts, unreadCount] = await Promise.all([
      db
        .collection(COL_ANOMALY_RUNS)
        .find({ orgId })
        .sort({ runAt: -1 })
        .limit(14)
        .project({ orgId: 1, runAt: 1, alertCount: 1, alerts: 1 })
        .toArray(),
      db
        .collection(COL_ANOMALY_ALERTS)
        .find({ orgId })
        .sort({ createdAt: -1 })
        .limit(40)
        .toArray(),
      db.collection(COL_ANOMALY_ALERTS).countDocuments({ orgId, read: false }),
    ]);

    const lastRunAt = runs[0]?.runAt ? String(runs[0].runAt) : null;
    let healthStatus: "healthy" | "attention" | "no_data" = "no_data";
    if (lastRunAt) {
      const daysSince = (Date.now() - new Date(lastRunAt).getTime()) / (24 * 60 * 60 * 1000);
      healthStatus = daysSince > 2.5 ? "attention" : "healthy";
    }

    return NextResponse.json({
      schema: "flux-board.anomaly_insights.v1",
      mongo: true,
      runs: runs.map((r) => ({
        id: r._id instanceof ObjectId ? r._id.toHexString() : String(r._id),
        runAt: r.runAt,
        alertCount: (r as { alertCount?: number }).alertCount ?? 0,
        alerts: Array.isArray((r as { alerts?: unknown }).alerts) ? (r as { alerts: unknown[] }).alerts : [],
      })),
      alerts: alerts.map((a) => ({
        id: a._id instanceof ObjectId ? a._id.toHexString() : String(a._id),
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        message: a.message,
        diagnostics: a.diagnostics ?? {},
        boardId: a.boardId,
        boardName: a.boardName,
        read: Boolean(a.read),
        createdAt: a.createdAt,
        runId: a.runId,
      })),
      unreadCount,
      health: {
        status: healthStatus,
        lastRunAt,
      },
    });
  } catch (e) {
    console.error("[anomaly-insights]", e);
    return NextResponse.json({ error: "Falha ao carregar insights" }, { status: 500 });
  }
}
