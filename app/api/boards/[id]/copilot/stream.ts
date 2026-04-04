import { updateBoardFromExisting } from "@/lib/kv-boards";
import { deriveEffectiveRoles } from "@/lib/rbac";
import {
  appendBoardCopilotMessages,
  sliceCopilotMessagesForLlm,
  type CopilotMessage,
  type CopilotMessageRole,
} from "@/lib/kv-board-copilot";
import { retrieveRelevantDocChunksWithDebug } from "@/lib/docs-rag";
import { buildCopilotWorldSnapshot } from "@/lib/copilot-world-snapshot";
import { executeCopilotActions, formatAssistantReply } from "./actions";
import { heuristicWeeklyBrief } from "./context-heuristics";
import { callCopilotLlmModel } from "./llm";
import type { CopilotAuthPayload, CopilotChatHistory } from "./types";
import { SSE_CHUNK_DELAY_MS, SSE_CHUNK_SIZE } from "./config";

export function createCopilotSseStream(params: {
  payload: CopilotAuthPayload & { username: string; orgRole?: string };
  boardId: string;
  board: Record<string, unknown>;
  chat: CopilotChatHistory;
  debugRag: boolean;
  userMessage: string;
  tier: string;
  org: Record<string, unknown>;
  gateCtx: Record<string, unknown>;
}): ReadableStream<Uint8Array> {
  const { payload, boardId, board, chat, debugRag, userMessage, tier, org, gateCtx } = params;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("status", { phase: "started" });

        const normalizedHistory: CopilotMessage[] = (chat.messages ?? []).map((m, idx) => ({
          id: String((m as { id?: string }).id ?? `legacy_${idx}`),
          role: (String(m.role) === "assistant" || String(m.role) === "tool" ? String(m.role) : "user") as CopilotMessageRole,
          content: String(m.content ?? ""),
          createdAt: String((m as { createdAt?: string }).createdAt ?? new Date(0).toISOString()),
        }));
        const historyMessages = sliceCopilotMessagesForLlm(normalizedHistory).map((m) => ({
          role: m.role as CopilotMessageRole,
          content: m.content,
        }));

        const ragResult = await retrieveRelevantDocChunksWithDebug(payload.orgId, userMessage, 12);
        const ragChunks = ragResult.chunks;
        if (debugRag) sendEvent("rag_debug", ragResult.debug);

        const { snapshot: worldSnapshot, ragChunksUsed } = await buildCopilotWorldSnapshot({
          orgId: payload.orgId,
          userId: payload.id,
          isAdmin: payload.isAdmin,
          boardId,
          board,
          userMessage,
          org: org as never,
          ragChunks,
          planGateCtx: gateCtx,
        });

        const modelOutput = await callCopilotLlmModel({
          org: org as never,
          orgId: payload.orgId,
          userId: payload.id,
          isAdmin: payload.isAdmin,
          board,
          boardName: String(board.name || "Board"),
          userMessage,
          historyMessages,
          tier: tier as never,
          worldSnapshot,
        });

        const actions = Array.isArray(modelOutput.actions) ? modelOutput.actions : [];
        let updatedCards: Record<string, unknown>[] | undefined = undefined;
        const orgRole = deriveEffectiveRoles({
          id: payload.id,
          isAdmin: payload.isAdmin,
          orgRole: payload.orgRole,
        }).orgRole;

        const exec = await executeCopilotActions({
          board,
          boardId,
          actions,
          userMessage,
          generateBrief: () => heuristicWeeklyBrief(board),
          notifyContext: {
            orgId: payload.orgId,
            userId: payload.id,
            username: payload.username,
            isAdmin: payload.isAdmin,
            orgRole,
          },
        });
        updatedCards = exec.updatedCards;
        const toolResults = exec.toolResults;

        const mutationTools = toolResults.filter((r) => r.ok && (r.tool === "moveCard" || r.tool === "updatePriority" || r.tool === "createCard"));
        if (mutationTools.length && Array.isArray(updatedCards)) {
          const nextBoard = await updateBoardFromExisting(
            board as never,
            { cards: updatedCards },
            { userId: payload.id, userName: payload.username, orgId: payload.orgId }
          );
          updatedCards = nextBoard.cards as Record<string, unknown>[];
          sendEvent("board_update", { cards: updatedCards, lastUpdated: nextBoard.lastUpdated });
        }

        for (const r of toolResults) sendEvent("tool_result", r);
        const finalReply = formatAssistantReply({ reply: modelOutput.reply, toolResults });

        const persisted = await appendBoardCopilotMessages({
          orgId: payload.orgId,
          boardId,
          userId: payload.id,
          incrementFreeDemoUsed: tier === "free",
          messagesToAppend: [
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: finalReply,
              meta: {
                toolResults,
                llmModel: modelOutput.llm?.model,
                llmProvider: modelOutput.llm?.provider,
                llmSource: modelOutput.llm?.source,
                sourceDocIds: [...new Set(ragChunksUsed.map((c) => c.docId))],
                sourceChunkIds: ragChunksUsed.map((c) => c.chunkId),
              },
            },
          ],
        });

        sendEvent("chat_persisted", { ok: true, messageCount: persisted.messages.length });
        sendEvent("llm_meta", {
          model: modelOutput.llm?.model,
          provider: modelOutput.llm?.provider,
          source: modelOutput.llm?.source,
        });
        sendEvent("reply_start", { ok: true });

        for (let i = 0; i < finalReply.length; i += SSE_CHUNK_SIZE) {
          sendEvent("assistant_delta", { text: finalReply.slice(i, i + SSE_CHUNK_SIZE) });
          await new Promise((r) => setTimeout(r, SSE_CHUNK_DELAY_MS));
        }

        sendEvent("done", { ok: true });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro interno na Fluxy.";
        sendEvent("error", { message });
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });
}

