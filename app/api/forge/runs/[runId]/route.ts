import { NextRequest, NextResponse } from "next/server";
import { getForgeJob, updateForgeJob } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
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
  return NextResponse.json({ run: job });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
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

  await updateForgeJob(ctx.payload.orgId, runId, {
    cancelRequested: true,
    status: "cancelled",
    timeline: [...job.timeline, { phase: "cancelled", at: new Date().toISOString(), detail: "api_delete" }],
  });
  return NextResponse.json({ ok: true });
}
