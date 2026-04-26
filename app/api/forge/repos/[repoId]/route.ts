import { NextResponse } from "next/server";
import { upsertIntegrationConnection, getIntegrationConnection } from "@/lib/kv-integrations";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { ensureOrgManager } from "@/lib/api-authz";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ repoId: string }> }) {
  await params; // reserved — org-level disconnect only for MVP
  const ctx = await requireForgeAuth(request);
  if (ctx instanceof Response) return ctx;
  const denied = ensureOrgManager(ctx.payload);
  if (denied) return denied;
  const gateCtx = planGateCtxFromAuthPayload(ctx.payload);
  try {
    assertForgeTierAllowed(ctx.org, "oneshot", gateCtx);
  } catch (e) {
    const j = jsonPlanGate(e);
    if (j) return j;
    throw e;
  }

  const existing = await getIntegrationConnection(ctx.payload.orgId, "github");
  if (!existing) return NextResponse.json({ ok: true });
  await upsertIntegrationConnection({
    orgId: ctx.payload.orgId,
    provider: "github",
    status: "disconnected",
    accountLabel: existing.accountLabel,
    externalOrgId: existing.externalOrgId,
  });
  return NextResponse.json({ ok: true });
}
