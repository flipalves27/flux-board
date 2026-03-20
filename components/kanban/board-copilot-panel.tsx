"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardData, CardData } from "@/app/board/[id]/page";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";

type CopilotTier = "free" | "pro" | "business";

type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

type CopilotHistoryResponse = {
  tier: CopilotTier;
  freeDemoRemaining: number | null;
  messages: CopilotMessage[];
};

type BoardCopilotPanelProps = {
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;
  updateDb: (updater: (prev: BoardData) => BoardData) => void;
};

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

export function BoardCopilotPanel({ boardId, boardName, getHeaders, updateDb }: BoardCopilotPanelProps) {
  const { pushToast } = useToast();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tier, setTier] = useState<CopilotTier | null>(null);
  const [freeDemoRemaining, setFreeDemoRemaining] = useState<number | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");

  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
        if (!res.ok) throw new Error(String((data as any)?.error || "Erro ao carregar histórico"));
        if (cancelled) return;
        setTier((data.tier as any) || null);
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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const streamCopilot = async (userMessage: string) => {
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: CopilotMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: userMessage,
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
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream no response.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const onEvent = (event: string, data: any) => {
        if (event === "assistant_delta") {
          const delta = typeof data?.text === "string" ? data.text : "";
          if (!delta) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${delta}` } : m))
          );
        }

        if (event === "chat_persisted" && tier === "free") {
          setFreeDemoRemaining((prev) => {
            if (typeof prev !== "number") return prev;
            return Math.max(0, prev - 1);
          });
        }

        if (event === "tool_result" && data?.message) {
          setMessages((prev) => {
            // Mantém curto: apenas adiciona quando não for uma tool flood.
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
          updateDb((prev) => ({ ...prev, cards }));
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
          onEvent(parsed.event, parsed.data);
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
  };

  const freeBanner = tier === "free" && freeDemoRemaining !== null ? (
    <div className="px-3 py-2 rounded-[10px] border border-[rgba(255,217,61,0.25)] bg-[rgba(255,217,61,0.10)] mb-3">
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
        className="fixed right-4 top-[92px] z-[470] px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.28)] bg-[rgba(108,92,231,0.10)] backdrop-blur-sm text-[var(--flux-text)] hover:border-[var(--flux-primary)] hover:bg-[rgba(108,92,231,0.18)] transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-semibold">{open ? "Fechar Copiloto" : "Copiloto do Board"}</span>
        {tier === "free" && freeDemoRemaining !== null ? (
          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border border-[rgba(255,217,61,0.35)] text-[var(--flux-warning)]">
            {freeDemoRemaining}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="fixed inset-0 z-[480] pointer-events-none">
          <div className="absolute right-4 top-[92px] bottom-4 w-[min(440px,92vw)] bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] shadow-[0_18px_60px_rgba(0,0,0,0.45)] pointer-events-auto flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold font-display text-[var(--flux-primary-light)] truncate">Copiloto</div>
                <div className="text-[11px] text-[var(--flux-text-muted)] mt-1 truncate">
                  {boardName || "Board"}{user?.username ? ` • ${user.username}` : ""}
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

                  <div className="space-y-2">
                    {messages.length === 0 ? (
                      <div className="text-xs text-[var(--flux-text-muted)]">
                        Envie uma mensagem, por exemplo: “Quais cards estão parados há mais de 5 dias?” ou “Resuma o progresso desta semana”.
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-[10px] border px-3 py-2 ${
                            m.role === "user"
                              ? "border-[rgba(108,92,231,0.35)] bg-[rgba(108,92,231,0.12)]"
                              : m.role === "tool"
                                ? "border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)]"
                                : "border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.12)]"
                          }`}
                        >
                          <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--flux-text-muted)]">
                            {m.role === "user" ? "Você" : m.role === "assistant" ? "Copiloto" : "Tool"}
                          </div>
                          <div className="text-xs text-[var(--flux-text)] mt-1 whitespace-pre-wrap leading-relaxed">
                            {m.content}
                          </div>
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

            <div className="px-4 pb-3 pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Pergunte ou peça uma ação..."
                  className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-xs outline-none focus:border-[var(--flux-primary)] resize-none"
                  disabled={!canSend}
                />
                <button
                  type="button"
                  className={`btn-primary px-4 ${!canSend ? "!opacity-60" : ""}`}
                  onClick={() => {
                    if (!draft.trim()) return;
                    if (!canSend) return;
                    const msg = draft.trim();
                    setDraft("");
                    streamCopilot(msg);
                  }}
                  disabled={!canSend}
                >
                  {generating ? "..." : "Enviar"}
                </button>
              </div>

              <div className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                Dica: diga “mova o card X para Em Execução” ou “ajuste a prioridade para Urgente”.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

