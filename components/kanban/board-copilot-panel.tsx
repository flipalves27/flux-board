"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useTranslations } from "next-intl";
import type { CardData } from "@/app/board/[id]/page";
import { formatNlqCopilotMessage, type NlqClientResponse } from "@/lib/board-nlq-format";
import { useBoardStore } from "@/stores/board-store";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useCopilotStore, type CopilotMessage, type CopilotTier } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import type { RagRetrievalDebug } from "@/lib/docs-rag";
import { AiModelHint } from "@/components/ai-model-hint";

type CopilotHistoryResponse = {
  tier: CopilotTier;
  freeDemoRemaining: number | null;
  messages: CopilotMessage[];
};

type BoardCopilotPanelProps = {
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
};

type NlqApiBody =
  | {
      ok: true;
      resultType: "cards";
      cardIds: string[];
      rows: Array<{ id: string; title: string; priority: string; bucketLabel: string }>;
      explanation: string;
    }
  | {
      ok: true;
      resultType: "metric";
      metric: "throughput";
      primaryValue: number;
      compareValue: number | null;
      chart: Array<{ label: string; value: number }>;
      explanation: string;
    }
  | { ok: false; fallbackMessage: string; suggestions: string[] };

type NlqResponsePayload = NlqApiBody & { error?: string; llmModel?: string };

function nlqToClient(data: NlqApiBody): NlqClientResponse {
  if (!data.ok) return data;
  if (data.resultType === "metric") {
    return {
      ok: true,
      resultType: "metric",
      primaryValue: data.primaryValue,
      compareValue: data.compareValue,
      explanation: data.explanation,
      chart: data.chart,
    };
  }
  return {
    ok: true,
    resultType: "cards",
    cardIds: data.cardIds,
    rows: data.rows,
    explanation: data.explanation,
  };
}

type WebSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
  onresult:
    | ((
        ev: {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }
      ) => void)
    | null;
};

/** NLQ no copiloto: `/query …` ou verbos em PT (ex.: «pesquisar atividades urgentes»). */
function extractNlqQueryFromCopilotInput(trimmed: string): { mode: "nlq"; query: string } | { mode: "none" } {
  if (/^\/query(\s|$)/i.test(trimmed)) {
    return { mode: "nlq", query: trimmed.replace(/^\/query\s*/i, "").trim() };
  }
  const m = trimmed.match(/^(pesquisar|buscar|listar|mostrar|filtrar)\s+(.+)$/i);
  const rest = m?.[2]?.trim();
  if (rest && rest.length >= 2) return { mode: "nlq", query: rest };
  return { mode: "none" };
}

function parseEventStreamFrame(frame: string): { event: string; data: unknown } | null {
  const lines = frame.split("\n").filter(Boolean);
  if (!lines.length) return null;

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "event") event = value;
    if (key === "data") dataLines.push(value);
  }

  const dataRaw = dataLines.join("\n");
  if (!dataRaw) return { event, data: {} };
  try {
    return { event, data: JSON.parse(dataRaw) };
  } catch {
    return { event, data: dataRaw };
  }
}

export function BoardCopilotPanel({ boardId, boardName, getHeaders }: BoardCopilotPanelProps) {
  const { pushToast } = useToast();
  const { user } = useAuth();
  const tNlq = useTranslations("kanban.board.nlq");
  const copilotDebug = process.env.NODE_ENV === "development";
  const [ragDebug, setRagDebug] = useState<RagRetrievalDebug | null>(null);

  const {
    open,
    toggleOpen,
    setOpen,
    loadingHistory,
    setLoadingHistory,
    generating,
    setGenerating,
    tier,
    setTier,
    freeDemoRemaining,
    setFreeDemoRemaining,
    messages,
    setMessages,
    draft,
    setDraft,
    voiceListening,
    setVoiceListening,
    voiceInterim,
    setVoiceInterim,
    voiceError,
    setVoiceError,
  } = useCopilotStore(
    useShallow((s) => ({
      open: s.open,
      toggleOpen: s.toggleOpen,
      setOpen: s.setOpen,
      loadingHistory: s.loadingHistory,
      setLoadingHistory: s.setLoadingHistory,
      generating: s.generating,
      setGenerating: s.setGenerating,
      tier: s.tier,
      setTier: s.setTier,
      freeDemoRemaining: s.freeDemoRemaining,
      setFreeDemoRemaining: s.setFreeDemoRemaining,
      messages: s.messages,
      setMessages: s.setMessages,
      draft: s.draft,
      setDraft: s.setDraft,
      voiceListening: s.voiceListening,
      setVoiceListening: s.setVoiceListening,
      voiceInterim: s.voiceInterim,
      setVoiceInterim: s.setVoiceInterim,
      voiceError: s.voiceError,
      setVoiceError: s.setVoiceError,
    }))
  );

  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null);

  const canSend = useMemo(() => {
    if (generating) return false;
    if (tier === "free" && freeDemoRemaining !== null && freeDemoRemaining <= 0) return false;
    return true;
  }, [generating, tier, freeDemoRemaining]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/copilot`, {
          method: "GET",
          headers: getHeaders(),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<CopilotHistoryResponse>;
        if (!res.ok) throw new Error(String((data as { error?: string })?.error || "Erro ao carregar histórico"));
        if (cancelled) return;
        setTier((data.tier as CopilotTier) || null);
        setFreeDemoRemaining(typeof data.freeDemoRemaining === "number" ? data.freeDemoRemaining : null);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (err) {
        if (cancelled) return;
        pushToast({ kind: "error", title: "Copiloto", description: err instanceof Error ? err.message : "Erro interno." });
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, getHeaders, pushToast, setFreeDemoRemaining, setLoadingHistory, setMessages, setTier]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const streamCopilot = useCallback(
    async (userMessage: string) => {
      const trimmed = userMessage.trim();
      const nlqRoute = extractNlqQueryFromCopilotInput(trimmed);
      if (nlqRoute.mode === "nlq") {
        if (!canSend) return;
        const q = nlqRoute.query;
        if (!q) {
          pushToast({ kind: "info", title: tNlq("toastTitle"), description: tNlq("emptyQuery") });
          return;
        }

        setGenerating(true);
        const userMsg: CopilotMessage = {
          id: `u_${Date.now()}`,
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
        const assistantId = `a_${Date.now()}`;
        const assistantMsg: CopilotMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);

        try {
          const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getHeaders() },
            body: JSON.stringify({ query: q }),
          });
          const data = (await res.json().catch(() => ({}))) as NlqResponsePayload;

          const nlqLlmMeta =
            typeof data.llmModel === "string" && data.llmModel.trim()
              ? { llmModel: data.llmModel.trim(), llmProvider: "Together" as const }
              : undefined;

          if (!res.ok) {
            const txt = data.error || tNlq("errorGeneric");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: txt, ...(nlqLlmMeta ? { meta: { ...m.meta, ...nlqLlmMeta } } : {}) } : m
              )
            );
            pushToast({ kind: "error", title: tNlq("toastTitle"), description: txt });
            return;
          }

          useBoardNlqUiStore.getState().setNlqLlmMeta(
            boardId,
            nlqLlmMeta ? { model: nlqLlmMeta.llmModel, provider: nlqLlmMeta.llmProvider } : null
          );

          if (!data.ok) {
            const asClient = nlqToClient(data as NlqApiBody);
            const content = formatNlqCopilotMessage(asClient);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content, ...(nlqLlmMeta ? { meta: { ...m.meta, ...nlqLlmMeta } } : {}) } : m
              )
            );
            pushToast({ kind: "info", title: tNlq("toastTitle"), description: data.fallbackMessage });
            return;
          }

          const asClient = nlqToClient(data as NlqApiBody);
          const content = formatNlqCopilotMessage(asClient);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content, ...(nlqLlmMeta ? { meta: { ...m.meta, ...nlqLlmMeta } } : {}) } : m
            )
          );

          if (data.resultType === "cards") {
            useBoardNlqUiStore.getState().setBoardNlqMetric(boardId, null);
            useBoardNlqUiStore.getState().setBoardNlqCards(boardId, data.cardIds);
          } else if (data.resultType === "metric") {
            useBoardNlqUiStore.getState().setBoardNlqCards(boardId, null);
            useBoardNlqUiStore.getState().setBoardNlqMetric(boardId, {
              headline: tNlq("metricHeadline", { value: data.primaryValue }),
              primaryValue: data.primaryValue,
              compareValue: data.compareValue,
              chart: Array.isArray(data.chart) ? data.chart : [],
              explanation: data.explanation,
            });
          }
        } catch {
          const txt = tNlq("errorGeneric");
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: txt } : m)));
          pushToast({ kind: "error", title: tNlq("toastTitle"), description: txt });
        } finally {
          setGenerating(false);
          endRef.current?.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      setGenerating(true);
      if (copilotDebug) setRagDebug(null);
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: CopilotMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const assistantId = `a_${Date.now()}`;
      const assistantMsg: CopilotMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      try {
        const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/copilot`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            message: trimmed,
            ...(copilotDebug ? { debug: true } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody?.error || `Erro ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Sem stream no response.");

        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        const onEvent = (
          event: string,
          data: {
            text?: string;
            message?: unknown;
            cards?: CardData[];
            phase?: string;
            method?: string;
            durationMs?: number;
            chunks?: unknown;
            model?: string;
            provider?: string;
            source?: string;
          }
        ) => {
          if (event === "error") {
            const msg =
              typeof (data as { message?: string })?.message === "string"
                ? String((data as { message: string }).message).trim()
                : "Erro no Copiloto.";
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || msg } : m))
            );
            pushToast({ kind: "error", title: "Copiloto", description: msg });
            return;
          }

          if (event === "rag_debug" && copilotDebug && data && typeof data === "object") {
            setRagDebug(data as RagRetrievalDebug);
          }

          if (event === "llm_meta") {
            const model = typeof data?.model === "string" ? data.model : undefined;
            const provider = typeof data?.provider === "string" ? data.provider : undefined;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, meta: { ...m.meta, llmModel: model, llmProvider: provider } } : m
              )
            );
          }

          if (event === "assistant_delta") {
            const delta = typeof data?.text === "string" ? data.text : "";
            if (!delta) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${delta}` } : m))
            );
          }

          if (event === "chat_persisted" && useCopilotStore.getState().tier === "free") {
            setFreeDemoRemaining((prev) => {
              if (typeof prev !== "number") return prev;
              return Math.max(0, prev - 1);
            });
          }

          if (event === "tool_result" && data?.message) {
            setMessages((prev) => {
              const toolMsg: CopilotMessage = {
                id: `tool_${Date.now()}_${Math.random().toString(16).slice(2, 5)}`,
                role: "tool",
                content: String(data.message || ""),
                createdAt: new Date().toISOString(),
              };
              return [...prev, toolMsg].slice(-120);
            });
          }

          if (event === "board_update" && Array.isArray(data?.cards)) {
            const cards = data.cards as CardData[];
            useBoardStore.getState().updateDb((d) => {
              d.cards = cards;
            });
          }

          if (event === "status" && data?.phase === "started") {
            // noop
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const parsed = parseEventStreamFrame(frame);
            if (!parsed) continue;
            onEvent(
              parsed.event,
              parsed.data as {
                text?: string;
                message?: unknown;
                cards?: CardData[];
                phase?: string;
                method?: string;
                durationMs?: number;
                chunks?: unknown;
                model?: string;
                provider?: string;
                source?: string;
              }
            );
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro interno ao gerar.";
        pushToast({ kind: "error", title: "Copiloto", description: message });
      } finally {
        setGenerating(false);
        setDraft("");
        abortRef.current = null;
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [
      boardId,
      canSend,
      copilotDebug,
      getHeaders,
      pushToast,
      setDraft,
      setFreeDemoRemaining,
      setGenerating,
      setMessages,
      tNlq,
    ]
  );

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceInterim("");
  }, [setVoiceInterim, setVoiceListening]);

  useEffect(() => {
    if (!open) stopVoice();
  }, [open, stopVoice]);

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  const startVoice = useCallback(() => {
    if (generating || !canSend) return;
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => WebSpeechRecognitionInstance;
    };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceError("Seu navegador não suporta reconhecimento de voz (Web Speech API).");
      return;
    }
    setVoiceError(null);
    stopVoice();
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec as WebSpeechRecognitionInstance;
    setVoiceListening(true);
    setVoiceInterim("");

    rec.onerror = () => {
      setVoiceError("Não foi possível capturar o áudio. Verifique o microfone e tente de novo.");
      stopVoice();
    };

    rec.onend = () => {
      setVoiceListening(false);
      setVoiceInterim("");
      recognitionRef.current = null;
    };

    rec.onresult = (event: {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    }) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const line = event.results[i];
        const chunk = line[0]?.transcript ?? "";
        if (line.isFinal) finalText += chunk;
        else interim += chunk;
      }
      setVoiceInterim(interim.trim());
      const merged = (finalText || "").trim();
      if (merged) {
        stopVoice();
        void streamCopilot(merged);
      }
    };

    try {
      rec.start();
    } catch {
      setVoiceError("Não foi possível iniciar o microfone.");
      stopVoice();
    }
  }, [
    canSend,
    generating,
    setVoiceError,
    setVoiceInterim,
    setVoiceListening,
    stopVoice,
    streamCopilot,
  ]);

  const freeBanner =
    tier === "free" && freeDemoRemaining !== null ? (
      <div className="px-3 py-2 rounded-[10px] border border-[var(--flux-warning-alpha-25)] bg-[var(--flux-warning-alpha-10)] mb-3">
        <div className="text-xs font-semibold text-[var(--flux-warning)]">
          Modo demo: {freeDemoRemaining} mensagem(ns) restante(s).
        </div>
        <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
          Faça upgrade para Pro/Business para usar o Copiloto ilimitadamente.
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        data-tour="board-copilot"
        className={`fixed z-[470] transition-all duration-200 active:scale-[0.98] ${
          open ? "right-[calc(min(440px,92vw)+16px)] top-[112px]" : "right-4 top-[112px]"
        }`}
        onClick={() => {
          if (!open) {
            useBoardActivityStore.getState().setOpen(false);
            useBoardExecutionInsightsStore.getState().setOpen(false);
          }
          toggleOpen();
        }}
        aria-expanded={open}
      >
        <span className="relative inline-flex items-center gap-2 rounded-l-xl rounded-r-md border border-[var(--flux-border-default)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-22),var(--flux-secondary-alpha-14))] px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md hover:border-[var(--flux-primary)]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 3l2.2 2.2L17 6l-1.1 2.8L18 12l-2.1 3.2L17 18l-2.8.8L12 21l-2.2-2.2L7 18l1.1-2.8L6 12l2.1-3.2L7 6l2.8-.8L12 3z" />
              <circle cx="12" cy="12" r="2.2" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold whitespace-nowrap">{open ? "Fechar IA" : "Copiloto IA"}</span>
          {tier === "free" && freeDemoRemaining !== null ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--flux-warning-alpha-40)] text-[var(--flux-warning)]">
              {freeDemoRemaining}
            </span>
          ) : null}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[480] pointer-events-none">
          <div className="absolute right-4 top-[92px] bottom-4 w-[min(440px,92vw)] bg-[var(--flux-surface-card)] border border-[var(--flux-border-subtle)] rounded-[var(--flux-rad)] shadow-[0_18px_60px_var(--flux-black-alpha-45)] pointer-events-auto flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--flux-chrome-alpha-08)] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold font-display text-[var(--flux-primary-light)] truncate">Copiloto</div>
                <div className="text-[11px] text-[var(--flux-text-muted)] mt-1 truncate">
                  {boardName || "Board"}
                  {user?.username ? ` • ${user.username}` : ""}
                </div>
              </div>
              <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 overflow-auto flex-1">
              {loadingHistory ? (
                <p className="text-xs text-[var(--flux-text-muted)]">Carregando histórico...</p>
              ) : (
                <>
                  {freeBanner}

                  {copilotDebug && ragDebug ? (
                    <div className="mb-3 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)] px-3 py-2 text-[10px] font-mono text-[var(--flux-text-muted)]">
                      <div className="font-semibold text-[var(--flux-text)]">
                        RAG debug · {ragDebug.method} · {ragDebug.durationMs}ms
                      </div>
                      <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-auto">
                        {ragDebug.chunks.map((c) => (
                          <li key={`${c.chunkId}:${c.score}`}>
                            {c.score.toFixed(3)} · {c.method} · {c.docTitle.slice(0, 40)}
                            {c.docTitle.length > 40 ? "…" : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {messages.length === 0 ? (
                      <div className="text-xs text-[var(--flux-text-muted)]">
                        Envie uma mensagem, por exemplo: “Quais cards estão parados há mais de 5 dias?” ou “Resuma o progresso desta
                        semana”. Para dados estruturados no board, use <span className="font-semibold">/query</span> (ex.: «/query cards
                        urgentes sem dono»).
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-[10px] border px-3 py-2 ${
                            m.role === "user"
                              ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)]"
                              : m.role === "tool"
                                ? "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)]"
                                : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-12)]"
                          }`}
                        >
                          <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--flux-text-muted)]">
                            {m.role === "user" ? "Você" : m.role === "assistant" ? "Copiloto" : "Tool"}
                          </div>
                          <div className="text-xs text-[var(--flux-text)] mt-1 whitespace-pre-wrap leading-relaxed">
                            {m.content}
                          </div>
                          {m.role === "assistant" && (m.meta?.llmModel || m.meta?.llmProvider) ? (
                            <div className="mt-2">
                              <AiModelHint
                                model={m.meta?.llmModel != null ? String(m.meta.llmModel) : undefined}
                                provider={m.meta?.llmProvider != null ? String(m.meta.llmProvider) : undefined}
                              />
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                    {generating ? (
                      <div className="text-xs text-[var(--flux-text-muted)] pt-1">Gerando resposta...</div>
                    ) : null}
                    <div ref={endRef} />
                  </div>
                </>
              )}
            </div>

            <div className="px-4 pb-3 pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
              {voiceListening && (
                <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-[var(--flux-teal-alpha-35)] bg-[var(--flux-teal-alpha-10)] px-3 py-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--flux-teal-brand)] opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--flux-teal-brand)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[var(--flux-teal-brand)]">Ouvindo… fale agora</div>
                    {voiceInterim ? (
                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-0.5 truncate">{voiceInterim}</div>
                    ) : null}
                  </div>
                  <button type="button" className="btn-secondary text-[10px] px-2 py-1 shrink-0" onClick={stopVoice}>
                    Parar
                  </button>
                </div>
              )}
              {voiceError ? <div className="mb-2 text-[11px] text-[var(--flux-danger-bright)]">{voiceError}</div> : null}

              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Pergunte ou peça uma ação..."
                  className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-xs outline-none focus:border-[var(--flux-primary)] resize-none"
                  disabled={!canSend}
                />
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={voiceListening ? "Parar microfone" : "Falar com o Copiloto"}
                    aria-label={voiceListening ? "Parar microfone" : "Falar com o Copiloto"}
                    className={`btn-secondary px-3 min-h-[44px] flex items-center justify-center ${
                      voiceListening ? "border-[var(--flux-teal-alpha-45)] bg-[var(--flux-teal-alpha-12)]" : ""
                    } ${!canSend ? "!opacity-60" : ""}`}
                    onClick={() => {
                      if (!canSend) return;
                      if (voiceListening) stopVoice();
                      else startVoice();
                    }}
                    disabled={!canSend}
                  >
                    <span className="text-lg leading-none">{voiceListening ? "■" : "🎤"}</span>
                  </button>
                  <button
                    type="button"
                    className={`btn-primary px-3 ${!canSend ? "!opacity-60" : ""}`}
                    onClick={() => {
                      if (!draft.trim()) return;
                      if (!canSend) return;
                      const msg = draft.trim();
                      setDraft("");
                      void streamCopilot(msg);
                    }}
                    disabled={!canSend}
                  >
                    {generating ? "..." : "Enviar"}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                Dica: use o microfone ou diga “mova o card X para Em Execução” ou “ajuste a prioridade para Urgente”.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
