import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { publicErrorMessage } from "@/lib/public-api-error";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { retrieveRelevantDocChunksWithDebug } from "@/lib/docs-rag";
import { fluxyPromptPrefix } from "@/lib/fluxy-persona";
import type { LlmChatMessage } from "@/lib/llm-provider";
import { appendWorkspaceFluxyMessages, getWorkspaceFluxyChat } from "@/lib/kv-workspace-fluxy-chat";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint } from "@/lib/kv-sprints";
import { buildSprintOverview, sprintOverviewToPromptContext } from "@/lib/sprint-overview";
import { assertFeatureAllowed } from "@/lib/plan-gates";

export const runtime = "nodejs";

const FREE_DEMO_MESSAGES_LIMIT = 3;

type Body = { message?: string; boardId?: string; sprintId?: string };

function formatRagContext(chunks: Array<{ docTitle: string; text: string }>): string {
  if (!chunks.length) return "";
  const parts = chunks.map((c, i) => `(${i + 1}) **${c.docTitle}**\n${c.text}`);
  return `\n\n### Trechos da documentação da organização\n${parts.join("\n\n")}`;
}

function workspaceHeuristicReply(userMessage: string, hasSprintContext: boolean): string {
  if (hasSprintContext) {
    return (
      "Não foi possível usar o modelo de IA agora (configuração ou limite). " +
      "Os dados da sprint em foco estão disponíveis na página de detalhe; tente novamente mais tarde ou verifique as chaves de API no ambiente.\n\n" +
      "Posso ainda ajudar com conceitos gerais de Scrum, Kanban e navegação no Flux-Board."
    );
  }
  const q = userMessage.toLowerCase();
  if (q.includes("board") || q.includes("quadro")) {
    return (
      "Para trabalhar com cards, prioridades e automações no contexto de um quadro, abra um **board** pela lista em **Boards**. " +
      "Lá a Fluxy usa o assistente completo com dados do quadro.\n\n" +
      "Posso continuar a ajudar aqui com conceitos gerais do Flux-Board ou navegação."
    );
  }
  return (
    "Estou em modo workspace: ajudo com **navegação**, **conceitos** do Flux-Board e **documentação** quando existir. " +
    "Em **Boards**, abra um quadro para eu responder com contexto dos seus cards e métricas.\n\n" +
    "Como posso ajudar?"
  );
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  const tier = getEffectiveTier(org, gateCtx);
  const chat = await getWorkspaceFluxyChat({ orgId: payload.orgId, userId: payload.id });
  const freeRemaining = tier === "free" ? Math.max(0, FREE_DEMO_MESSAGES_LIMIT - chat.freeDemoUsed) : null;

  return NextResponse.json({
    tier,
    freeDemoRemaining: freeRemaining,
    messages: chat.messages.slice(-60),
  });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const boardIdCtx = sanitizeText(body.boardId ?? "").trim().slice(0, 200);
  const sprintIdCtx = sanitizeText(body.sprintId ?? "").trim().slice(0, 200);
  const rawMsg = sanitizeText(body.message).trim();
  const guarded = guardUserPromptForLlm(rawMsg);
  const userMessage = guarded.text;
  if (!userMessage) {
    return NextResponse.json({ error: "Mensagem é obrigatória." }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  const tier = getEffectiveTier(org, gateCtx);
  const copilotFeatureAllowed = canUseFeature(org, "board_copilot", gateCtx);

  if (tier !== "free") {
    if (!copilotFeatureAllowed) {
      return NextResponse.json({ error: "Recurso disponível apenas para Pro/Business." }, { status: 403 });
    }
  }

  const chat = await getWorkspaceFluxyChat({ orgId: payload.orgId, userId: payload.id });
  if (tier === "free" && chat.freeDemoUsed >= FREE_DEMO_MESSAGES_LIMIT) {
    return NextResponse.json(
      { error: "Modo demo atingiu o limite. Faça upgrade para Pro/Business para continuar." },
      { status: 403 }
    );
  }

  const rl = await rateLimit({
    key: `workspace:fluxy-chat:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const llmCloudEnabled = isOrgCloudLlmConfigured(org);
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("status", { phase: "started" });

        const historyMessages: LlmChatMessage[] = chat.messages
          .slice(-12)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        const ragResult = await retrieveRelevantDocChunksWithDebug(payload.orgId, userMessage, 8);
        const ragBlock = formatRagContext(
          ragResult.chunks.map((c) => ({ docTitle: c.docTitle || "Doc", text: c.text || "" }))
        );

        const orgLabel = typeof org.name === "string" && org.name.trim() ? org.name.trim() : "sua organização";

        let boardSummaryBlock = "";
        if (boardIdCtx && !sprintIdCtx) {
          try {
            const canB = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardIdCtx);
            if (canB) {
              const b = await getBoard(boardIdCtx, payload.orgId);
              if (b) {
                const cards = Array.isArray(b.cards) ? b.cards : [];
                const order = Array.isArray(b.config?.bucketOrder) ? b.config!.bucketOrder! : [];
                const counts = new Map<string, number>();
                for (const c of cards) {
                  const bk = String((c as { bucket?: string }).bucket || "");
                  counts.set(bk, (counts.get(bk) ?? 0) + 1);
                }
                const perCol = order
                  .slice(0, 12)
                  .map((col) => {
                    const k = String((col as { key?: string }).key || "");
                    return `${k}=${counts.get(k) ?? 0}`;
                  })
                  .join("; ");
                boardSummaryBlock =
                  "\n\n### Board em foco (resumo compacto)\n" +
                  `nome=${String(b.name || boardIdCtx).slice(0, 120)}; totalCards=${cards.length}; porColuna=${perCol || "—"}\n` +
                  "Limitação: só este quadro; para detalhe de cards usa o board no produto.";
              }
            }
          } catch {
            boardSummaryBlock = "";
          }
        }

        let sprintContextBlock = "";
        if (boardIdCtx && sprintIdCtx) {
          try {
            assertFeatureAllowed(org, "sprint_engine", gateCtx);
            const canB = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardIdCtx);
            if (canB) {
              const sp = await getSprint(payload.orgId, sprintIdCtx);
              if (sp && sp.boardId === boardIdCtx) {
                const b = await getBoard(boardIdCtx, payload.orgId);
                if (b) {
                  const ov = buildSprintOverview(b, sp);
                  sprintContextBlock =
                    "\n\n### Sprint em foco (dados reais do workspace)\n" + sprintOverviewToPromptContext(b.name, ov);
                }
              }
            }
          } catch {
            sprintContextBlock = "";
          }
        }

        const systemLines = sprintContextBlock
          ? [
              `Contexto: workspace Flux-Board, organização «${orgLabel}». O utilizador tem uma **sprint em foco** com dados anexados abaixo.`,
              "Responda com base na sprint em foco, nos trechos de documentação e em boas práticas ágeis.",
              "Não invente cards ou métricas fora do contexto fornecido. Cite IDs de cards entre colchetes quando útil.",
              "Seja concisa.",
              sprintContextBlock,
            ]
          : boardSummaryBlock
            ? [
                `Contexto: workspace Flux-Board, organização «${orgLabel}». Segue um **resumo de um board** que o utilizador indicou (sem lista de cards).`,
                "Use apenas estes agregados; não invente títulos de cards ou donos.",
                "Seja concisa. Para operações nos cards, oriente a abrir o quadro e usar a Fluxy no board.",
                boardSummaryBlock.trimStart(),
              ]
            : [
                `Contexto: o utilizador está na área geral do workspace do Flux-Board (fora de um quadro aberto), na organização «${orgLabel}».`,
                "Ajude com navegação, conceitos do produto (boards, cards, colunas, relatórios, documentos) e boas práticas.",
                "Não invente dados de quadros, cards ou clientes que não apareçam nos trechos de documentação fornecidos.",
                "Seja concisa. Se a pergunta exigir dados de um board específico sem contexto anexado, oriente a abrir esse board e usar a Fluxy lá.",
              ];

        const systemContent = fluxyPromptPrefix(systemLines.join("\n")) + ragBlock;

        const llmMessages: LlmChatMessage[] = [
          { role: "system", content: systemContent },
          ...historyMessages,
          { role: "user", content: userMessage },
        ];

        const canCallLlm = isOrgCloudLlmConfigured(org);

        let finalReply: string;
        let llmModel: string | undefined;
        let llmProvider: string | undefined;
        let llmSource: "cloud" | "heuristic" = "cloud";

        if (!canCallLlm) {
          finalReply = workspaceHeuristicReply(userMessage, Boolean(sprintContextBlock));
          llmSource = "heuristic";
        } else {
          const res = await runOrgLlmChat({
            org,
            orgId: payload.orgId,
            feature: "workspace_fluxy_chat",
            messages: llmMessages,
            mode: "interactive",
            userId: payload.id,
            isAdmin: payload.isAdmin,
            options: { temperature: 0.35, maxTokens: 1800 },
          });

          if (!res.ok) {
            sendEvent("error", { message: res.error || "Falha ao gerar resposta." });
            controller.close();
            return;
          }

          finalReply = res.assistantText.trim() || workspaceHeuristicReply(userMessage, Boolean(sprintContextBlock));
          llmModel = res.model;
          llmProvider = res.provider;
        }

        const persisted = await appendWorkspaceFluxyMessages({
          orgId: payload.orgId,
          userId: payload.id,
          incrementFreeDemoUsed: tier === "free",
          messagesToAppend: [
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: finalReply,
              meta: { llmModel, llmProvider, llmSource },
            },
          ],
        });

        sendEvent("chat_persisted", { ok: true, messageCount: persisted.messages.length });
        sendEvent("llm_meta", { model: llmModel, provider: llmProvider, source: llmSource });
        sendEvent("reply_start", { ok: true });

        const step = 28;
        for (let i = 0; i < finalReply.length; i += step) {
          const chunk = finalReply.slice(i, i + step);
          sendEvent("assistant_delta", { text: chunk });
          await new Promise((r) => setTimeout(r, 10));
        }

        sendEvent("done", { ok: true });
        controller.close();
      } catch (err) {
        const message = publicErrorMessage(err, "Erro interno na Fluxy.", "api/workspace/fluxy-chat/route.ts");
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
