import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { LssAssistBodySchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { buildLssAssistSystemPrompt, buildLssAssistUserPrompt, type LssAssistMode } from "@/lib/lss-assist-prompt";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  if (board.boardMethodology !== "lean_six_sigma") {
    return NextResponse.json({ error: "Assistente LSS disponível apenas em boards Lean Six Sigma." }, { status: 400 });
  }

  const tier = getEffectiveTier(org, gateCtx);
  const copilotFeatureAllowed = canUseFeature(org, "board_copilot", gateCtx);
  if (tier !== "free") {
    if (!copilotFeatureAllowed) {
      return NextResponse.json({ error: "Recurso disponível apenas para Pro/Business." }, { status: 403 });
    }
  }

  const llmCloudEnabled =
    (Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL)) || Boolean(process.env.ANTHROPIC_API_KEY);
  if (tier === "free" && llmCloudEnabled) {
    const cap = getDailyAiCallsCap(org, gateCtx);
    if (cap !== null) {
      const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
      const rlDaily = await rateLimit({
        key: dailyKey,
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return NextResponse.json(
          { error: "Limite diário de chamadas de IA atingido. Faça upgrade no Stripe." },
          { status: 403 }
        );
      }
    }
  }

  const rl = await rateLimit({
    key: `boards:lss-assist:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = LssAssistBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const mode = parsed.data.mode as LssAssistMode;
  const guarded = guardUserPromptForLlm(sanitizeText(parsed.data.context).trim());
  const context = guarded.text;

  let cardSnippet = "";
  const cid = parsed.data.cardId?.trim();
  if (cid) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const c = cards.find((x) => x && typeof x === "object" && String((x as { id?: string }).id) === cid) as
      | { title?: string; desc?: string; bucket?: string }
      | undefined;
    if (c) {
      cardSnippet = [`Título: ${String(c.title ?? "")}`, `Coluna: ${String(c.bucket ?? "")}`, `Descrição:\n${String(c.desc ?? "")}`]
        .join("\n")
        .slice(0, 8000);
    }
  }

  const system = buildLssAssistSystemPrompt(mode);
  const userContent = buildLssAssistUserPrompt(context, cardSnippet || undefined);

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "board_lss_assist",
    mode: "interactive",
    userId: payload.id,
    isAdmin: payload.isAdmin,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    options: { maxTokens: 2500, temperature: 0.4 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Falha ao gerar com IA." }, { status: 502 });
  }

  const markdown = String(res.assistantText ?? "").trim();
  return NextResponse.json({
    markdown: markdown || "(Resposta vazia.)",
    model: res.model,
    provider: res.provider,
  });
}
