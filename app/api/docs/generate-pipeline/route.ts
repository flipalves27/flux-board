import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, listBoardsForUser, userCanAccessBoard } from "@/lib/kv-boards";
import { createDoc } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { logDocsMetric } from "@/lib/docs-metrics";
import { rateLimit } from "@/lib/rate-limit";
import { loadOkrProjectionsForBoard } from "@/lib/okr-projection-load";
import {
  defaultTitleForFlow,
  flowTag,
  type DocsGenerationFlow,
  formatBoardAndPortfolioContext,
  formatDailyForPrompt,
  formatFreePromptContext,
  formatOkrProjectionsForPrompt,
  generateMarkdownWithTogether,
  heuristicBoardStatusMarkdown,
  heuristicDailyMinutesMarkdown,
  heuristicFreePromptMarkdown,
  heuristicOkrProgressMarkdown,
  ragChunkCountAfterSave,
} from "@/lib/docs-generation";
import type { OkrProjectionLoadResult } from "@/lib/okr-projection-load";

function isFlow(s: unknown): s is DocsGenerationFlow {
  return s === "board_status" || s === "daily_minutes" || s === "okr_progress" || s === "free_prompt";
}

const SYS: Record<DocsGenerationFlow, string> = {
  board_status: [
    "Você é analista de operações no Flux (Kanban).",
    "Escreva um relatório de status em Markdown (pt-BR), profissional e escaneável.",
    "Seções sugeridas: Resumo executivo; Saúde do fluxo/cards; Portfólio (comparativo); Riscos e bloqueios; Próximos passos.",
    "Use apenas os dados fornecidos. Sem inventar números ou nomes não presentes no contexto.",
    "Saída: somente Markdown, sem cercas ``` ao redor do documento inteiro.",
  ].join(" "),
  daily_minutes: [
    "Você é secretário(a) de reunião no Flux.",
    "Produza uma ata em Markdown (pt-BR): título com data se disponível; Decisões; Ações (com dono se citado); Itens em aberto; Próximos passos.",
    "Baseie-se na transcrição e no insight estruturado. Não invente participantes.",
    "Saída: somente Markdown.",
  ].join(" "),
  okr_progress: [
    "Você prepara relatório de OKRs para comitê no Flux.",
    "Markdown (pt-BR): resumo executivo; por KR (progresso, projeção, risco); recomendações objetivas.",
    "Use apenas os dados de projeção fornecidos.",
    "Saída: somente Markdown.",
  ].join(" "),
  free_prompt: [
    "Você é assistente de documentação no Flux.",
    "Atenda o pedido do usuário em Markdown (pt-BR), usando o contexto do board.",
    "Seja factual em relação aos cards listados; não invente itens.",
    "Saída: somente Markdown.",
  ].join(" "),
};

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  if (!canUseFeature(org, "flux_docs_rag", gateCtx)) {
    return NextResponse.json({ error: "RAG / Flux Docs indisponível no plano atual." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    flow?: unknown;
    boardId?: unknown;
    quarter?: unknown;
    dailyInsightId?: unknown;
    transcript?: unknown;
    title?: unknown;
    prompt?: unknown;
  };

  if (!isFlow(body.flow)) {
    return NextResponse.json({ error: "flow inválido." }, { status: 400 });
  }
  const flow = body.flow;

  const boardId = String(body.boardId || "").trim();
  if (!boardId) return NextResponse.json({ error: "boardId é obrigatório." }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  if (flow === "okr_progress" && !canUseFeature(org, "okr_engine", gateCtx)) {
    return NextResponse.json({ error: "OKRs disponíveis apenas em planos com Flux Goals." }, { status: 403 });
  }

  if (flow === "free_prompt") {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return NextResponse.json({ error: "prompt é obrigatório neste fluxo." }, { status: 400 });
  }

  const rl = await rateLimit({
    key: `docs:generate-pipeline:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas gerações. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const tier = getEffectiveTier(org, gateCtx);
  const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
  if (tier === "free" && togetherEnabled) {
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
          { error: "Limite diário de chamadas de IA atingido. Faça upgrade no plano." },
          { status: 403 }
        );
      }
    }
  }

  const quarter = body.quarter != null && String(body.quarter).trim() ? String(body.quarter).trim() : null;
  const dailyInsightId = body.dailyInsightId != null ? String(body.dailyInsightId).trim() || null : null;
  const transcriptOverride = typeof body.transcript === "string" ? body.transcript : null;
  const titleOverride = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  const userPrompt = String(body.prompt || "").trim();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("step", { id: "collect", label: "Coletando contexto do Flux", status: "running" });

        const allBoards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
        let userContent = "";
        let defaultTitle = defaultTitleForFlow(flow, board, quarter);
        if (titleOverride) defaultTitle = titleOverride;

        let okrLoaded: OkrProjectionLoadResult | null = null;

        if (flow === "board_status") {
          userContent = formatBoardAndPortfolioContext(board, allBoards);
        } else if (flow === "daily_minutes") {
          userContent = formatDailyForPrompt(board, dailyInsightId, transcriptOverride);
        } else if (flow === "okr_progress") {
          okrLoaded = await loadOkrProjectionsForBoard({
            orgId: payload.orgId,
            userId: payload.id,
            isAdmin: payload.isAdmin,
            boardId,
            quarter,
          });
          const qLabel = quarter || okrLoaded.grouped[0]?.objective.quarter || currentQuarterLabel();
          defaultTitle = titleOverride || defaultTitleForFlow(flow, board, qLabel);
          userContent = formatOkrProjectionsForPrompt(okrLoaded.projections, qLabel);
        } else {
          userContent = formatFreePromptContext(board, userPrompt);
        }

        sendEvent("step", { id: "collect", label: "Coletando contexto do Flux", status: "done" });

        sendEvent("step", { id: "draft", label: "Gerando Markdown (IA)", status: "running" });

        const sys = SYS[flow];
        const ai = await generateMarkdownWithTogether({ system: sys, user: userContent });

        let markdown = "";
        let usedAi = false;

        if (ai.ok) {
          markdown = ai.markdown;
          usedAi = true;
        } else {
          if (flow === "board_status") markdown = heuristicBoardStatusMarkdown(board, allBoards, defaultTitle);
          else if (flow === "daily_minutes") {
            markdown = heuristicDailyMinutesMarkdown(board, dailyInsightId, defaultTitle, transcriptOverride);
          } else if (flow === "okr_progress") {
            if (!okrLoaded) {
              okrLoaded = await loadOkrProjectionsForBoard({
                orgId: payload.orgId,
                userId: payload.id,
                isAdmin: payload.isAdmin,
                boardId,
                quarter,
              });
            }
            const qLabel =
              quarter || okrLoaded.grouped[0]?.objective.quarter || currentQuarterLabel();
            markdown = heuristicOkrProgressMarkdown(okrLoaded.projections, qLabel, defaultTitle);
          } else {
            markdown = heuristicFreePromptMarkdown(board, userPrompt, defaultTitle);
          }
        }

        sendEvent("preview", { markdown: markdown.slice(0, 120_000) });
        sendEvent("step", { id: "draft", label: "Gerando Markdown (IA)", status: "done", usedAi, fallback: !usedAi });

        sendEvent("step", { id: "save", label: "Salvando no Flux Docs", status: "running" });

        const tags = ["ia-docs", "generated", flowTag(flow)];
        const doc = await createDoc({
          orgId: payload.orgId,
          title: defaultTitle,
          contentMd: markdown,
          tags,
        });

        logDocsMetric("docs.generate_pipeline", {
          orgId: payload.orgId,
          boardId,
          flow,
          docId: doc.id,
          usedAi,
        });

        sendEvent("step", { id: "save", label: "Salvando no Flux Docs", status: "done", docId: doc.id });

        sendEvent("step", { id: "rag", label: "Indexando para o Copilot (RAG)", status: "running" });
        const ragChunks = ragChunkCountAfterSave(doc);
        sendEvent("step", { id: "rag", label: "Indexando para o Copilot (RAG)", status: "done", chunkCount: ragChunks });

        sendEvent("done", {
          ok: true,
          doc,
          usedAi,
          ragChunks,
          llmModel: ai.ok ? ai.model : undefined,
        });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao gerar documento.";
        sendEvent("error", { message });
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function currentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}
