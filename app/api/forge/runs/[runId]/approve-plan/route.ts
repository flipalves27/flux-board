import { NextRequest, NextResponse } from "next/server";
import { getForgeJob, updateForgeJob } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const ctx = await requireForgeAuth(request);
  if (ctx instanceof Response) return ctx;
  const gateCtx = planGateCtxFromAuthPayload(ctx.payload);
  try {
    assertForgeTierAllowed(ctx.org, "oneshot", gateCtx);
  } catch (e) {
    const j = jsonPlanGate(e);
    if (j) return j;
    throw e;
  }

  const job = await getForgeJob(ctx.payload.orgId, runId);
  if (!job) return NextResponse.json({ error: "Run não encontrada" }, { status: 404 });
  if (job.status !== "plan_review") {
    return NextResponse.json({ error: "Run não está aguardando aprovação" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const next = await updateForgeJob(ctx.payload.orgId, runId, {
    planApprovedAt: now,
    status: "generating",
    timeline: [...job.timeline, { phase: "plan_approved", at: now }],
  });
  return NextResponse.json({ run: next });
}
