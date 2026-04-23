import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { isBoardMethodology } from "@/lib/board-methodology";
import {
  aiDraftToSnapshot,
  generateTemplateDraftWithTogether,
  generateTemplateFromConversationTurn,
  type ConversationAnswers,
} from "@/lib/template-ai";

function validateConversationTurn(turnIndex: number, answers: ConversationAnswers): string | null {
  if (turnIndex >= 0 && (!answers.teamType || answers.teamType.trim().length < 2)) {
    return "Informe o tipo de time (ao menos 2 caracteres).";
  }
  if (turnIndex >= 1 && (!answers.process || answers.process.trim().length < 2)) {
    return "Descreva o processo ou número de etapas (ao menos 2 caracteres).";
  }
  if (turnIndex >= 2 && (!answers.metrics || answers.metrics.trim().length < 2)) {
    return "Informe as métricas importantes (ao menos 2 caracteres).";
  }
  return null;
}

function parseConversationBody(body: unknown): {
  answers: ConversationAnswers;
  turnIndex: number;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.mode !== "conversation") return null;
  const turnIndex = typeof o.turnIndex === "number" ? o.turnIndex : Number(o.turnIndex);
  if (!Number.isFinite(turnIndex) || turnIndex < 0 || turnIndex > 3) return null;
  const raw = o.answers;
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const answers: ConversationAnswers = {
    teamType: typeof a.teamType === "string" ? a.teamType : undefined,
    process: typeof a.process === "string" ? a.process : undefined,
    metrics: typeof a.metrics === "string" ? a.metrics : undefined,
    automation:
      typeof a.automation === "string"
        ? a.automation
        : turnIndex >= 3
          ? ""
          : undefined,
  };
  return { answers, turnIndex };
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetRaw = body && typeof body === "object" ? (body as { targetMethodology?: unknown }).targetMethodology : undefined;
  const targetMethodology = isBoardMethodology(targetRaw) && targetRaw === "safe" ? targetRaw : undefined;

  const conv = parseConversationBody(body);
  if (conv) {
    const err = validateConversationTurn(conv.turnIndex, conv.answers);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }
    const gen = await generateTemplateFromConversationTurn(conv.answers, conv.turnIndex, targetMethodology);
    if (!gen.ok || !gen.draft) {
      return NextResponse.json({ error: gen.error || "Falha ao gerar template." }, { status: 400 });
    }
    const snapshot = aiDraftToSnapshot(gen.draft, { boardMethodology: targetMethodology });
    return NextResponse.json({
      mode: "conversation",
      turnIndex: conv.turnIndex,
      draft: gen.draft,
      snapshot,
      automationIdeas: gen.draft.automationIdeas,
      llmModel: gen.llmModel,
    });
  }

  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 10) {
    return NextResponse.json({ error: "Descreva o time com pelo menos 10 caracteres." }, { status: 400 });
  }

  const gen = await generateTemplateDraftWithTogether(description, { targetMethodology });
  if (!gen.ok || !gen.draft) {
    return NextResponse.json({ error: gen.error || "Falha ao gerar template." }, { status: 400 });
  }

  const snapshot = aiDraftToSnapshot(gen.draft, { boardMethodology: targetMethodology });
  return NextResponse.json({
    draft: gen.draft,
    snapshot,
    automationIdeas: gen.draft.automationIdeas,
    llmModel: gen.llmModel,
  });
}
