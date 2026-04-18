import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { resolveOnda4Flags } from "@/lib/onda4-flags";
import { sanitizeText } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { fluxyClassifyRequestSchema } from "@/lib/fluxy-intent-schema";
import type { FluxyClassifyContext, FluxyClassifyMeta, FluxyCostHint } from "@/lib/fluxy-intent-types";
import { enrichIntent } from "@/lib/fluxy-intent-enrich";
import { runFluxyClassifyPipeline } from "@/lib/fluxy-classify-pipeline";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function costHintFromMeta(tier: FluxyClassifyMeta["classifierTier"], cacheHit: boolean): FluxyCostHint {
  if (cacheHit) return "none";
  if (tier === "local") return "none";
  if (tier === "haiku" || tier === "together_fast") return "low";
  if (tier === "together_full") return "medium";
  return "medium";
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const org = await getOrganizationById(payload.orgId);
  const flags = resolveOnda4Flags(org);
  if (!flags.enabled || !flags.omnibar) {
    return NextResponse.json({ error: "Omnibar Onda 4 desativada para esta organização." }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `fluxy:classify:user:${payload.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas classificações. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = fluxyClassifyRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", details: parsed.error.flatten() }, { status: 400 });
  }

  const locale = parsed.data.locale ?? "pt-BR";
  const rawText = sanitizeText(parsed.data.text).trim().slice(0, 2000);
  const guarded = guardUserPromptForLlm(rawText);
  const text = guarded.text.trim();
  if (!text) {
    return NextResponse.json({ error: "Texto é obrigatório." }, { status: 400 });
  }

  const ctxBody = parsed.data.context;
  const context: FluxyClassifyContext = {
    pathname: ctxBody?.pathname?.trim().slice(0, 2048) ?? "",
    boardId: ctxBody?.boardId?.trim().slice(0, 200),
    localOnly: Boolean(ctxBody?.localOnly),
  };

  const classified = await runFluxyClassifyPipeline({
    text,
    locale,
    context,
    orgId: payload.orgId,
    userId: payload.id,
    isAdmin: payload.isAdmin,
    org,
  });

  const enriched = enrichIntent({
    intent: classified.intent,
    speech: classified.budgetBlocked ? "Limite diário de IA atingido — usando heurísticas locais." : classified.speech,
    context,
    userText: text,
  });

  const meta: FluxyClassifyMeta = {
    costHint: costHintFromMeta(classified.tier, classified.cacheHit),
    classifierTier: classified.tier,
    confidence: classified.confidence,
    locale,
    budgetBlocked: classified.budgetBlocked,
    cacheHit: classified.cacheHit,
  };

  return NextResponse.json({
    intent: classified.intent,
    speech: enriched.speech,
    results: enriched.results,
    meta,
  });
}
