"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FluxyMessageData } from "@/lib/schemas";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { classifyFluxyIntentForDisplay } from "@/lib/fluxy-message-intent";

function ageLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function FluxyBubble({ message }: { message: FluxyMessageData }) {
  const isFluxy = message.mediatedByFluxy;
  const chips = [
    message.relatedCardId ? `Card ${message.relatedCardId}` : "Board",
    message.mentions.length > 0 ? `@ ${message.mentions.length}` : null,
    message.targetUserIds.length > 0 ? `Entrega ${message.targetUserIds.length}` : null,
  ].filter(Boolean) as string[];
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${isFluxy ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)]" : "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)]"}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isFluxy ? "text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)]"}`}>
          {isFluxy ? "Fluxy" : "Membro"}
        </span>
        <span className="text-[10px] text-[var(--flux-text-muted)]">{ageLabel(message.createdAt)}</span>
      </div>
      <p className="text-sm text-[var(--flux-text)] whitespace-pre-wrap break-words">{message.body}</p>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)]">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CardFluxyMessagesTab({ cardId }: { cardId: string }) {
  const { boardId, getHeaders } = useCardModal();
  const [messages, setMessages] = useState<FluxyMessageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const baseUrl = `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/messages`;

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(baseUrl, { headers: getApiHeaders(getHeaders()) });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: FluxyMessageData[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setMessages(items.slice().reverse());
    } finally {
      setLoading(false);
    }
  }, [baseUrl, getHeaders]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const ev = new EventSource(`${baseUrl}?stream=1`);
    const onCreated = () => {
      void loadMessages();
    };
    ev.addEventListener("message.created", onCreated);
    return () => {
      ev.removeEventListener("message.created", onCreated);
      ev.close();
    };
  }, [baseUrl, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = useCallback(async (payload: { text: string; mediatedByFluxy: boolean }) => {
    const text = payload.text.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await apiFetch(baseUrl, {
        method: "POST",
        headers: getApiHeaders(getHeaders()),
        body: JSON.stringify({
          body: text,
          conversationScope: "card",
          mediatedByFluxy: payload.mediatedByFluxy,
        }),
      });
      if (!res.ok) return;
      setBody("");
      void loadMessages();
    } finally {
      setSending(false);
    }
  }, [baseUrl, getHeaders, loadMessages]);

  const fluxySummary = useMemo(() => {
    const scoped = messages.slice(-8);
    const fluxyCount = scoped.filter((m) => m.mediatedByFluxy).length;
    const mentionCount = scoped.reduce((acc, m) => acc + m.mentions.length, 0);
    if (!scoped.length) return "Sem decisões ainda. Use ações rápidas para iniciar o fluxo da Fluxy.";
    if (fluxyCount === 0) return "Thread ativa sem mediação da Fluxy nas últimas interações.";
    return `Fluxy mediou ${fluxyCount} mensagem(ns) recentes e registrou ${mentionCount} menção(ões).`;
  }, [messages]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-primary-alpha-08)] p-3">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--flux-primary-light)]">Resumo da Fluxy</div>
        <p className="mt-1 text-sm text-[var(--flux-text)]">{fluxySummary}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => setBody("/bloquear card impedido por dependência externa")} className="rounded-full border border-[var(--flux-primary-alpha-35)] px-2.5 py-1 text-[11px] text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-12)]">
            Marcar como bloqueado
          </button>
          <button type="button" onClick={() => setBody("/adiar 3d por alinhamento com cliente")} className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[11px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]">
            Pedir confirmação
          </button>
          <button type="button" onClick={() => setBody("@responsavel consegue atualizar status até hoje?")} className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[11px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]">
            Cobrar atualização
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2].map((x) => <div key={x} className="h-20 animate-pulse rounded-2xl bg-[var(--flux-chrome-alpha-06)]" />)}</div>
      ) : messages.length > 0 ? (
        <div className="space-y-2.5">
          {messages.map((message) => {
            const { intent, decision } = classifyFluxyIntentForDisplay(message.body);
            const showCtas = Boolean(message.mediatedByFluxy && intent !== "none");
            return (
              <div key={message.id} className="space-y-1.5">
                <FluxyBubble message={message} />
                {showCtas ? (
                  <div className="flex flex-wrap gap-2 pl-1">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        void send({
                          text: `[CONFIRMO APLICAR] ${message.body}`,
                          mediatedByFluxy: true,
                        })
                      }
                      className="rounded-full bg-[var(--flux-primary)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50 hover:bg-[var(--flux-primary-light)]"
                    >
                      Aplicar ajuste
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        const snippet = message.body.slice(0, 160);
                        void send({
                          text: `Fluxy: pedir confirmação da equipe antes de alterar o card — "${snippet}${message.body.length > 160 ? "…" : ""}"`,
                          mediatedByFluxy: true,
                        });
                      }}
                      className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-3 py-1 text-[11px] text-[var(--flux-text-muted)] disabled:opacity-50 hover:border-[var(--flux-primary-alpha-35)]"
                    >
                      Pedir confirmação
                    </button>
                    {decision === "confirmation_required" ? (
                      <span className="self-center text-[10px] text-[var(--flux-warning)]">Aguardando confirmação explícita</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--flux-chrome-alpha-12)] py-8 text-center text-sm text-[var(--flux-text-muted)]">
          Nenhuma mensagem Fluxy neste card ainda.
        </div>
      )}

      <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Escreva para a thread Fluxy… (@nome, /bloquear, /adiar 3d)"
          className="w-full resize-none bg-transparent text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--flux-text-muted)]">{body.length}/4000</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void send({ text: body, mediatedByFluxy: false })} disabled={!body.trim() || sending} className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-xs text-[var(--flux-text-muted)] disabled:opacity-50">
              Membro
            </button>
            <button type="button" onClick={() => void send({ text: body, mediatedByFluxy: true })} disabled={!body.trim() || sending} className="rounded-full bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {sending ? "..." : "Enviar para Fluxy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
