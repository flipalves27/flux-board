import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { COL_ANOMALY_ALERTS } from "@/lib/anomaly-service";

/** Marca alertas como lidos (IDs do Mongo). Body: { ids?: string[], markAll?: boolean } */
export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    if (!isMongoConfigured()) {
      return NextResponse.json({ ok: true, modified: 0 });
    }

    const body = (await request.json().catch(() => ({}))) as { ids?: string[]; markAll?: boolean };
    const db = await getDb();
    const orgId = payload.orgId;

    if (body.markAll) {
      const res = await db.collection(COL_ANOMALY_ALERTS).updateMany({ orgId, read: false }, { $set: { read: true } });
      return NextResponse.json({ ok: true, modified: res.modifiedCount });
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string" && ObjectId.isValid(x)) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Informe ids ou markAll" }, { status: 400 });
    }

    const oids = ids.map((id) => new ObjectId(id));
    const res = await db
      .collection(COL_ANOMALY_ALERTS)
      .updateMany({ orgId, _id: { $in: oids } }, { $set: { read: true } });

    return NextResponse.json({ ok: true, modified: res.modifiedCount });
  } catch (e) {
    console.error("[anomaly-alerts/read]", e);
    return NextResponse.json({ error: "Falha ao atualizar" }, { status: 500 });
  }
}
