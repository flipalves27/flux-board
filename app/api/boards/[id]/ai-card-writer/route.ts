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
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import {
  buildCardWriterMessages,
  parseCardWriterResponse,
  type CardWriterType,
} from "@/lib/ai-card-writer";
import { zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  prompt: z.string().trim().min(5).max(4000),
  cardType: z.enum(["feature", "bug", "tech_debt", "spike", "general"]).default("general"),
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
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  try {
    assertFeatureAllowed(org, "ai_card_writer", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
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

  const { prompt, cardType } = parsed.data;

  const config = board.config ?? {};
  const columns = Array.isArray(config.columns) ? config.columns.map((c: Record<string, unknown>) => String(c.label || c.key || "")) : [];
  const allTags = new Set<string>();
  for (const card of (board.cards ?? [])) {
    const c = card as Record<string, unknown>;
    if (Array.isArray(c.tags)) {
      for (const tag of c.tags) {
        if (typeof tag === "string") allTags.add(tag);
      }
    }
  }

  const messages = buildCardWriterMessages({
    userPrompt: prompt,
    cardType: cardType as CardWriterType,
    boardColumns: columns.length > 0 ? columns : ["Backlog", "Em andamento", "Concluída"],
    existingTags: [...allTags],
    priorities: ["Urgente", "Importante", "Média"],
  });

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "ai_card_writer",
    mode: "interactive",
    userId: payload.id,
    isAdmin: payload.isAdmin,
    messages,
    options: { maxTokens: 1200, temperature: 0.3 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Falha ao gerar card" },
      { status: res.error?.includes("Cota") ? 403 : 500 }
    );
  }

  const structured = parseCardWriterResponse(res.assistantText ?? "");
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
