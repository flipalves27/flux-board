import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConnection } from "@/lib/kv-integrations";
import { createForgeOctokit } from "@/lib/forge-github-client";
import { indexRepositoryTree } from "@/lib/forge-repo-index";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
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

  const repoFullName = decodeURIComponent(repoId);
  const conn = await getIntegrationConnection(ctx.payload.orgId, "github");
  const octo = conn?.status === "connected" ? await createForgeOctokit(conn) : null;
  if (!octo) {
    return NextResponse.json({ error: "GitHub App não configurada" }, { status: 400 });
  }

  try {
    const idx = await indexRepositoryTree({
      orgId: ctx.payload.orgId,
      repoFullName,
      octokit: octo.octokit,
    });
    return NextResponse.json({ ok: true, ...idx });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "reindex_failed" }, { status: 500 });
  }
}
