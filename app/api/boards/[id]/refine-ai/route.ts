import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
  PlanGateError,
} from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { buildCardRefineUserPrompt, parseCardRefineJson } from "@/lib/card-refine-ai";
import { zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(6000).optional().default(""),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
  try {
    assertFeatureAllowed(org, "executive_brief", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({
      key: makeDailyAiCallsRateLimitKey(payload.orgId),
      limit: dailyCap,
      windowMs: getDailyAiCallsWindowMs(),
    });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const { title, description } = parsed.data;
  const prompt = buildCardRefineUserPrompt(title, description);

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "card_refine_ai",
    mode: "interactive",
    userId: payload.id,
    isAdmin: payload.isAdmin,
    messages: [{ role: "user", content: prompt }],
    options: { maxTokens: 900, temperature: 0.35 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Falha ao refinar" },
      { status: res.error?.includes("Cota") ? 403 : 500 }
    );
  }

  const structured = parseCardRefineJson(res.assistantText ?? "");
  if (!structured) {
    return NextResponse.json({
      ok: true,
      raw: (res.assistantText ?? "").trim(),
      parsed: null as null,
      model: res.model,
    });
  }

  return NextResponse.json({ ok: true, parsed: structured, model: res.model });
}
