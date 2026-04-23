"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useTranslations } from "next-intl";
import type { CardData } from "@/app/board/[id]/page";
import { formatNlqCopilotMessage, type NlqClientResponse } from "@/lib/board-nlq-format";
import { useBoardStore } from "@/stores/board-store";
import { useBoardNlqUiStore } from "@/stores/board-nlq-ui-store";
import { useCopilotStore, type CopilotMessage, type CopilotTier, type FluxyBoardDockIntent } from "@/stores/copilot-store";
import { useBoardActivityStore } from "@/stores/board-activity-store";
import { useBoardExecutionInsightsStore } from "@/stores/board-execution-insights-store";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import { sessionCanManageOrgBilling } from "@/lib/rbac";
import type { RagRetrievalDebug } from "@/lib/docs-rag";
import { AiModelHint } from "@/components/ai-model-hint";
import { AiFeedbackInline } from "@/components/ai/ai-feedback-inline";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { FluxySpeechBubble } from "@/components/fluxy/fluxy-speech-bubble";
import { FluxyStatusPill } from "@/components/fluxy/fluxy-status-pill";
import { resolveFluxyCopilotState } from "@/components/fluxy/resolve-fluxy-copilot-state";
import { fluxyVisualStateCopy } from "@/lib/fluxy-visual-state-copy";
import { AiAssistantIcon } from "@/components/icons/ai-assistant-icon";
import { BoardFluxyMessagesPanel } from "@/components/kanban/board-fluxy-messages-panel";
import { useWebSpeechRecognition } from "@/hooks/use-web-speech-recognition";

type CopilotHistoryResponse = {
  tier: CopilotTier;
  freeDemoRemaining: number | null;
  messages: CopilotMessage[];
};

type BoardCopilotPanelProps = {
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  /** When true, the floating trigger is rendered by `BoardDesktopToolsRail` instead. */
  hideDesktopFab?: boolean;
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

export function BoardCopilotPanel({ boardId, boardName, getHeaders, hideDesktopFab = false }: BoardCopilotPanelProps) {
  const { pushToast } = useToast();
  const { user } = useAuth();
  const tNlq = useTranslations("kanban.board.nlq");
  const tFluxy = useTranslations("kanban.board.fluxyCopilot");
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
  const copilotOpenPrevRef = useRef(false);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fluxyWaving, setFluxyWaving] = useState(false);
  const [fluxyCelebrating, setFluxyCelebrating] = useState(false);
  const [fluxyErrorFlash, setFluxyErrorFlash] = useState(false);
  const errorFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const COPILOT_TAB_KEY = "flux-board.copilot.sideTab";
  const [sideTab, setSideTabState] = useState<"chat" | "sala">("chat");
  useEffect(() => {
    try {
      if (localStorage.getItem(COPILOT_TAB_KEY) === "sala") setSideTabState("sala");
    } catch {
      /* ignore */
    }
  }, []);
  const setSideTab = useCallback((tab: "chat" | "sala") => {
    setSideTabState(tab);
    try {
      localStorage.setItem(COPILOT_TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, []);

  const [salaDock, setSalaDock] = useState<FluxyBoardDockIntent | null>(null);

  useEffect(() => {
    if (!open) {
      setSalaDock(null);
      return;
    }
    const d = useCopilotStore.getState().consumeFluxyBoardDock();
    if (d) {
      setSalaDock(d);
      if (d.expandSala) setSideTab("sala");
    }
  }, [open, setSideTab]);

  const triggerFluxyCelebrate = useCallback(() => {
    if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
    setFluxyCelebrating(true);
    celebrateTimerRef.current = setTimeout(() => {
      setFluxyCelebrating(false);
      celebrateTimerRef.current = null;
    }, 2200);
  }, []);

  const triggerFluxyErrorFlash = useCallback(() => {
    if (errorFlashTimerRef.current) clearTimeout(errorFlashTimerRef.current);
    setFluxyErrorFlash(true);
    errorFlashTimerRef.current = setTimeout(() => {
      setFluxyErrorFlash(false);
      errorFlashTimerRef.current = null;
    }, 2500);
  }, []);

  useEffect(
    () => () => {
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
      if (errorFlashTimerRef.current) clearTimeout(errorFlashTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!open) {
      copilotOpenPrevRef.current = false;
      return;
    }
    const wasClosed = !copilotOpenPrevRef.current;
    copilotOpenPrevRef.current = true;
    if (!wasClosed) return;
    try {
      if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem("fluxy:copilot-waved")) {
        sessionStorage.setItem("fluxy:copilot-waved", "1");
        setFluxyWaving(true);
        const t = window.setTimeout(() => setFluxyWaving(false), 2400);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore
    }
  }, [open]);

  const boardDb = useBoardStore(
    useShallow((s) => (s.boardId === boardId && s.db ? s.db : null))
  );

  const fluxyInsights = useMemo(() => {
    if (!boardDb?.cards?.length) return [];
    const cards = boardDb.cards;
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startT = startToday.getTime();
    let overdue = 0;
    let inProgress = 0;
    let urgent = 0;
    let blocked = 0;
    for (const c of cards) {
      if (c.progress === "Em andamento") inProgress += 1;
      if (c.priority === "Urgente") urgent += 1;
      const bb = Array.isArray(c.blockedBy) ? c.blockedBy : [];
      if (bb.length > 0) blocked += 1;
      if (c.dueDate && c.progress !== "Concluída") {
        const t = new Date(c.dueDate).getTime();
        if (Number.isFinite(t) && t < startT) overdue += 1;
      }
    }
    const rows: string[] = [];
    rows.push(tFluxy("insightTotal", { count: cards.length }));
    if (blocked > 0) rows.push(tFluxy("insightBlocked", { count: blocked }));
    if (overdue > 0) rows.push(tFluxy("insightOverdue", { count: overdue }));
    else if (inProgress > 0) rows.push(tFluxy("insightInProgress", { count: inProgress }));
    else if (urgent > 0) rows.push(tFluxy("insightUrgent", { count: urgent }));
    return rows.slice(0, 4);
  }, [boardDb, tFluxy]);

  const fluxyBlockedCount = useMemo(() => {
    if (!boardDb?.cards?.length) return 0;
    return boardDb.cards.filter((c) => Array.isArray(c.blockedBy) && c.blockedBy.length > 0).length;
  }, [boardDb]);

  const lastAssistantContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i]?.content ?? "";
    }
    return "";
  }, [messages]);

  const fluxyVisualState = resolveFluxyCopilotState({
    panelOpen: open,
    loadingHistory,
    generating,
    lastAssistantContent,
    waving: fluxyWaving,
    celebrating: fluxyCelebrating,
    errorFlash: fluxyErrorFlash,
  });

  const canSend = useMemo(() => {
    if (generating) return false;
    if (user && sessionCanManageOrgBilling(user)) return true;
    if (tier === "free" && freeDemoRemaining !== null && freeDemoRemaining <= 0) return false;
    return true;
  }, [generating, tier, freeDemoRemaining, user]);

  // setters do zustand são estáveis; omitir do array evita re-fetch desnecessário ao abrir o board.
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
  }, [open, boardId, getHeaders, pushToast]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, [open, messages, generating]);

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

        let nlqCelebrate = false;
        try {
          const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/nlq`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getHeaders() },
            body: JSON.stringify({ query: q }),
          });
          const data = (await res.json().catch(() => ({}))) as NlqResponsePayload;

          const nlqLlmMeta =
            typeof data.llmModel === "string" && data.llmModel.trim()
              ? { llmModel: data.llmModel.trim(), llmProvider: "openai_compat" as const }
              : undefined;

          if (!res.ok) {
            const txt = data.error || tNlq("errorGeneric");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: txt, ...(nlqLlmMeta ? { meta: { ...m.meta, ...nlqLlmMeta } } : {}) } : m
              )
            );
            pushToast({ kind: "error", title: tNlq("toastTitle"), description: txt });
            triggerFluxyErrorFlash();
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
            nlqCelebrate = true;
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
          nlqCelebrate = true;
        } catch {
          const txt = tNlq("errorGeneric");
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: txt } : m)));
          pushToast({ kind: "error", title: tNlq("toastTitle"), description: txt });
          triggerFluxyErrorFlash();
        } finally {
          setGenerating(false);
          endRef.current?.scrollIntoView({ behavior: "auto" });
          if (nlqCelebrate) triggerFluxyCelebrate();
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

      let sseStreamErrored = false;
      let sseCelebrate = false;

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
            sseStreamErrored = true;
            const msg =
              typeof (data as { message?: string })?.message === "string"
                ? String((data as { message: string }).message).trim()
                : tFluxy("streamErrorFallback");
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || msg } : m))
            );
            pushToast({ kind: "error", title: tFluxy("toastErrorTitle"), description: msg });
            triggerFluxyErrorFlash();
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

        if (!sseStreamErrored && !controller.signal.aborted) sseCelebrate = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro interno ao gerar.";
        pushToast({ kind: "error", title: tFluxy("toastErrorTitle"), description: message });
        triggerFluxyErrorFlash();
      } finally {
        setGenerating(false);
        setDraft("");
        abortRef.current = null;
        endRef.current?.scrollIntoView({ behavior: "auto" });
        if (sseCelebrate) triggerFluxyCelebrate();
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
      tFluxy,
      tNlq,
      triggerFluxyCelebrate,
      triggerFluxyErrorFlash,
    ]
  );

  const { start: startVoiceRecognition, stop: stopVoice } = useWebSpeechRecognition({
    lang: "pt-BR",
    continuous: false,
    getMessages: () => ({
      notSupported: tFluxy("voiceNotSupported"),
      micError: tFluxy("voiceMicError"),
      startError: tFluxy("voiceStartError"),
    }),
    onFinal: (text) => {
      void streamCopilot(text);
    },
    onListeningChange: setVoiceListening,
    onInterimChange: setVoiceInterim,
    onErrorChange: setVoiceError,
  });

  const startVoice = useCallback(() => {
    if (generating || !canSend) return;
    startVoiceRecognition();
  }, [canSend, generating, startVoiceRecognition]);

  useEffect(() => {
    if (!open) stopVoice();
  }, [open, stopVoice]);

  const freeBanner =
    tier === "free" && freeDemoRemaining !== null ? (
      <div className="px-3 py-2 rounded-[10px] border border-[var(--flux-warning-alpha-25)] bg-[var(--flux-warning-alpha-10)] mb-3">
        <div className="text-xs font-semibold text-[var(--flux-warning)]">
          {tFluxy("demoTitle", { count: freeDemoRemaining })}
        </div>
        <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">{tFluxy("demoBody")}</div>
      </div>
    ) : null;

  return (
    <>
      {!hideDesktopFab ? (
        <button
          type="button"
          data-tour="board-copilot"
          className={`max-md:hidden fixed z-[var(--flux-z-fab-copilot)] transition-all duration-200 active:scale-[0.98] ${
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
          aria-label={open ? tFluxy("fabClose") : tFluxy("fabOpen")}
        >
          <span className="relative inline-flex items-center gap-2 rounded-l-xl rounded-r-md border border-[var(--flux-border-default)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-22),var(--flux-secondary-alpha-14))] px-2.5 py-2 text-[var(--flux-text)] shadow-[var(--flux-shadow-copilot-bubble)] backdrop-blur-md hover:border-[var(--flux-primary)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
              <AiAssistantIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[11px] font-semibold whitespace-nowrap">{open ? tFluxy("fabClose") : tFluxy("fabOpen")}</span>
            {tier === "free" && freeDemoRemaining !== null ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--flux-warning-alpha-40)] text-[var(--flux-warning)]">
                {freeDemoRemaining}
              </span>
            ) : null}
          </span>
        </button>
      ) : null}

      {open && (
        <div className="fixed inset-0 z-[var(--flux-z-fab-panel-backdrop)] pointer-events-none">
          <div className="absolute right-4 top-[92px] bottom-4 flex w-[min(440px,92vw)] flex-col overflow-hidden rounded-[20px] border-[1.5px] border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] font-fluxy shadow-[0_18px_60px_var(--flux-black-alpha-45)] backdrop-blur-[12px] pointer-events-auto">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FluxyAvatar
                    state={fluxyVisualState}
                    size="header"
                    showConfetti={fluxyCelebrating}
                    title={tFluxy("title")}
                    interactive
                  />
                  <div className="min-w-0">
                    <div className="truncate font-fluxy text-sm font-bold leading-tight text-[var(--flux-primary-light)]">
                      {tFluxy("title")}
                    </div>
                    <div className="truncate text-[10px] text-[var(--flux-text-muted)]">{tFluxy("subtitle")}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--flux-text-muted)]">
                      {boardName || "Board"}
                      {user?.username ? ` • ${user.username}` : ""}
                    </div>
                  </div>
                </div>
                <FluxyStatusPill
                  className="w-full max-w-full justify-start px-3 py-2"
                  {...fluxyVisualStateCopy(fluxyVisualState, tFluxy)}
                />
              </div>
              <button type="button" className="btn-secondary shrink-0 px-3 py-1.5" onClick={() => setOpen(false)}>
                {tFluxy("close")}
              </button>
            </div>

            <div className="flex-1 overflow-auto px-4 pb-2 pt-3">
              {loadingHistory ? (
                <p className="text-xs text-[var(--flux-text-muted)]">{tFluxy("loadingHistory")}</p>
              ) : (
                <>
                  <div className="mb-2 flex gap-1 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-08)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setSideTab("chat")}
                      className={`flex-1 rounded-[8px] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        sideTab === "chat"
                          ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                          : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                      }`}
                    >
                      {tFluxy("tabChat")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSideTab("sala")}
                      className={`flex-1 rounded-[8px] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                        sideTab === "sala"
                          ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                          : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                      }`}
                    >
                      {tFluxy("tabSala")}
                    </button>
                  </div>

                  {sideTab === "sala" ? (
                    <BoardFluxyMessagesPanel
                      boardId={boardId}
                      getHeaders={getHeaders}
                      embedded
                      salaActive={sideTab === "sala"}
                      deepLinkIntent={salaDock}
                    />
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
                          <div className="space-y-2 text-xs text-[var(--flux-text-muted)]">
                            <FluxySpeechBubble className="text-left">{tFluxy("emptyIntro")}</FluxySpeechBubble>
                            {fluxyInsights.length > 0 ? (
                              <div className="rounded-[10px] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-12)] px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-secondary)]">
                                  {tFluxy("insightsHeading")}
                                </div>
                                <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                                  {fluxyInsights.map((line) => (
                                    <li key={line}>{line}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {fluxyBlockedCount > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      sessionStorage.setItem(
                                        "flux-board.sala-prefill",
                                        "Fluxy: notifica o responsável que há cards bloqueados no quadro e pede priorização."
                                      );
                                    } catch {
                                      /* ignore */
                                    }
                                    setSideTab("sala");
                                  }}
                                  className="rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1 text-[10px] text-[var(--flux-primary-light)]"
                                >
                                  {tFluxy("suggestionNotifyBlocked")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      sessionStorage.setItem(
                                        "flux-board.sala-prefill",
                                        "Fluxy: avisa o responsável do card em foco que precisamos de atualização."
                                      );
                                    } catch {
                                      /* ignore */
                                    }
                                    setSideTab("sala");
                                  }}
                                  className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
                                >
                                  {tFluxy("suggestionNotifyAssignee")}
                                </button>
                              </div>
                            ) : null}
                            <ul className="list-disc pl-4 space-y-1">
                              <li>{tFluxy("emptyTipWeekly")}</li>
                              <li>{tFluxy("emptyTipNlq")}</li>
                              <li>{tFluxy("emptyTipVoice")}</li>
                            </ul>
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
                                {m.role === "user"
                                  ? tFluxy("roleUser")
                                  : m.role === "assistant"
                                    ? tFluxy("roleAssistant")
                                    : tFluxy("roleTool")}
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
                              {m.role === "assistant" ? (
                                <AiFeedbackInline
                                  feature="board_copilot"
                                  targetId={m.id}
                                  boardId={boardId}
                                  getHeaders={getHeaders}
                                />
                              ) : null}
                            </div>
                          ))
                        )}
                        {generating ? (
                          <div className="text-xs text-[var(--flux-text-muted)] pt-1 flex items-center gap-2">
                            <FluxyAvatar state={fluxyVisualState} size="compact" className="origin-left" />
                            <span>{tFluxy("generating")}</span>
                          </div>
                        ) : null}
                        <div ref={endRef} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="px-4 pb-3 pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
              {sideTab === "sala" ? (
                <p className="py-1 text-[11px] text-[var(--flux-text-muted)]">{tFluxy("salaFooterHint")}</p>
              ) : null}
              {sideTab === "chat" && voiceListening && (
                <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-[var(--flux-teal-alpha-35)] bg-[var(--flux-teal-alpha-10)] px-3 py-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--flux-teal-brand)] opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--flux-teal-brand)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[var(--flux-teal-brand)]">{tFluxy("listening")}</div>
                    {voiceInterim ? (
                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-0.5 truncate">{voiceInterim}</div>
                    ) : null}
                  </div>
                  <button type="button" className="btn-secondary text-[10px] px-2 py-1 shrink-0" onClick={stopVoice}>
                    {tFluxy("stopRecording")}
                  </button>
                </div>
              )}
              {sideTab === "chat" && voiceError ? (
                <div className="mb-2 text-[11px] text-[var(--flux-danger-bright)]">{voiceError}</div>
              ) : null}

              {sideTab === "chat" ? (
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={tFluxy("placeholder")}
                  className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-xs outline-none focus:border-[var(--flux-primary)] resize-none"
                  disabled={!canSend}
                />
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={voiceListening ? tFluxy("micStop") : tFluxy("micSpeak")}
                    aria-label={voiceListening ? tFluxy("micStop") : tFluxy("micSpeak")}
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
              ) : null}

              {sideTab === "chat" ? (
                <div className="text-[11px] text-[var(--flux-text-muted)] mt-2">{tFluxy("hintFooter")}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
