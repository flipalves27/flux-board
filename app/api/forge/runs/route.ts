import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { insertForgeJob } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

const PostSchema = z.object({
  boardId: z.string().trim().optional(),
  cardIds: z.array(z.string().trim()).min(1).max(80),
  tier: z.enum(["oneshot", "tested", "autonomous"]),
  repoId: z.string().trim().optional(),
  repoFullName: z.string().trim().min(3).max(200).optional(),
  branchBase: z.string().trim().max(200).optional(),
  batchId: z.string().trim().max(120).optional(),
  requirePlanApproval: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const tierParam = searchParams.get("tier");
  const tier =
    tierParam === "oneshot" || tierParam === "tested" || tierParam === "autonomous" ? tierParam : undefined;
  const batchId = searchParams.get("batch") ?? undefined;
  const { listForgeJobs } = await import("@/lib/kv-forge");
  const rows = await listForgeJobs({
    orgId: ctx.payload.orgId,
    status,
    tier,
    batchId: batchId ?? undefined,
    limit: 100,
  });
  return NextResponse.json({ runs: rows });
}

export async function POST(request: NextRequest) {
  const ctx = await requireForgeAuth(request);
  if (ctx instanceof Response) return ctx;
  const gateCtx = planGateCtxFromAuthPayload(ctx.payload);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertForgeTierAllowed(ctx.org, parsed.data.tier, gateCtx);
  } catch (e) {
    const j = jsonPlanGate(e);
    if (j) return j;
    throw e;
  }

  const batchId = parsed.data.batchId ?? (parsed.data.cardIds.length > 1 ? `fb_${randomBytes(6).toString("hex")}` : undefined);

  const job = await insertForgeJob({
    orgId: ctx.payload.orgId,
    createdByUserId: ctx.payload.id,
    boardId: parsed.data.boardId ?? null,
    cardIds: parsed.data.cardIds,
    tier: parsed.data.tier,
    repoId: parsed.data.repoId ?? null,
    repoFullName: parsed.data.repoFullName ?? null,
    branchBase: parsed.data.branchBase ?? "main",
    batchId: batchId ?? null,
    status: "queued",
    timeline: [],
    requirePlanApproval: parsed.data.requirePlanApproval ?? false,
  });

  return NextResponse.json({ run: job });
}
