import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { reindexAllDocsForOrg } from "@/lib/kv-doc-chunks";
import { listDocsFlat } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxForAuth } from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { isMongoConfigured } from "@/lib/mongo";

export const runtime = "nodejs";

/**
 * Reindexa embeddings RAG de todos os Flux Docs da org (útil após mudar modelo ou índice vetorial).
 */
export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  if (!canUseFeature(org, "flux_docs", gateCtx)) {
    return NextResponse.json({ error: "Flux Docs indisponível no plano atual." }, { status: 403 });
  }
  if (!canUseFeature(org, "flux_docs_rag", gateCtx)) {
    return NextResponse.json({ error: "RAG / indexação semântica indisponível no plano atual." }, { status: 403 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB é necessário para indexação vetorial." }, { status: 400 });
  }

  const rl = await rateLimit({
    key: `docs:reindex:org:${payload.orgId}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas reindexações. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const docs = await listDocsFlat(payload.orgId);
  const result = await reindexAllDocsForOrg(payload.orgId, docs, { forceReembed: true });

  return NextResponse.json({
    ok: true,
    ...result,
    note: result.skippedNoApi
      ? "TOGETHER_API_KEY ausente ou falha na API — embeddings não atualizados."
      : undefined,
  });
}
