"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);

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

  const streamCopilot = useCallback(async (userMessage: string) => {
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
  }, [boardId, freeDemoRemaining, getHeaders, pushToast, tier, updateDb]);

  const stopVoice = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceInterim("");
  }, []);

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
  }, [canSend, generating, stopVoice, streamCopilot]);

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
        className="fixed right-4 top-[92px] z-[470] flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)]/90 backdrop-blur-md text-[var(--flux-text)] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)] transition-all duration-200 hover:border-[var(--flux-primary)] hover:bg-[var(--flux-surface-elevated)] hover:shadow-[0_12px_36px_-8px_rgba(108,92,231,0.35)] active:scale-[0.98]"
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
              {voiceListening && (
                <div className="mb-2 flex items-center gap-2 rounded-[10px] border border-[rgba(0,201,183,0.35)] bg-[rgba(0,201,183,0.10)] px-3 py-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C9B7] opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00C9B7]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-[#00C9B7]">Ouvindo… fale agora</div>
                    {voiceInterim ? (
                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-0.5 truncate">{voiceInterim}</div>
                    ) : null}
                  </div>
                  <button type="button" className="btn-secondary text-[10px] px-2 py-1 shrink-0" onClick={stopVoice}>
                    Parar
                  </button>
                </div>
              )}
              {voiceError ? (
                <div className="mb-2 text-[11px] text-[#F97373]">{voiceError}</div>
              ) : null}

              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Pergunte ou peça uma ação..."
                  className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-xs outline-none focus:border-[var(--flux-primary)] resize-none"
                  disabled={!canSend}
                />
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={voiceListening ? "Parar microfone" : "Falar com o Copiloto"}
                    aria-label={voiceListening ? "Parar microfone" : "Falar com o Copiloto"}
                    className={`btn-secondary px-3 min-h-[44px] flex items-center justify-center ${
                      voiceListening ? "border-[rgba(0,201,183,0.45)] bg-[rgba(0,201,183,0.12)]" : ""
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

