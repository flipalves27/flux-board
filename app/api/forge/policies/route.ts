import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getForgePolicy, upsertForgePolicy } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { ensureOrgManager } from "@/lib/api-authz";

export const runtime = "nodejs";

const PutSchema = z.object({
  repoId: z.string().trim().max(120).nullable().optional(),
  defaultLanguage: z.string().trim().max(80).nullable().optional(),
  blockedPaths: z.array(z.string().trim().max(200)).max(100).optional(),
  maxFilesPerPr: z.number().int().min(1).max(200).optional(),
  maxLocPerPr: z.number().int().min(1).max(50000).optional(),
  redactPiiRegex: z.string().trim().max(500).nullable().optional(),
  requireHumanPlanApproval: z.boolean().optional(),
  outboundWebhookUrl: z.string().trim().url().max(2048).nullable().optional(),
  defaultModelOverride: z.string().trim().max(120).nullable().optional(),
});

export async function GET(request: Request) {
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

  const policy = await getForgePolicy(ctx.payload.orgId, null);
  return NextResponse.json({ policy });
}

export async function PUT(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const cur = await getForgePolicy(ctx.payload.orgId, parsed.data.repoId ?? null);
  const next = await upsertForgePolicy({
    orgId: ctx.payload.orgId,
    repoId: parsed.data.repoId ?? null,
    defaultLanguage: parsed.data.defaultLanguage ?? cur?.defaultLanguage ?? null,
    blockedPaths: parsed.data.blockedPaths ?? cur?.blockedPaths,
    maxFilesPerPr: parsed.data.maxFilesPerPr ?? cur?.maxFilesPerPr,
    maxLocPerPr: parsed.data.maxLocPerPr ?? cur?.maxLocPerPr,
    redactPiiRegex: parsed.data.redactPiiRegex ?? cur?.redactPiiRegex ?? null,
    requireHumanPlanApproval: parsed.data.requireHumanPlanApproval ?? cur?.requireHumanPlanApproval,
    outboundWebhookUrl: parsed.data.outboundWebhookUrl ?? cur?.outboundWebhookUrl ?? null,
    defaultModelOverride: parsed.data.defaultModelOverride ?? cur?.defaultModelOverride ?? null,
  });
  return NextResponse.json({ policy: next });
}
