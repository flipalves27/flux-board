"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { FluxyMessageData } from "@/lib/schemas";
import { classifyFluxyIntentForDisplay } from "@/lib/fluxy-message-intent";

const QUICK_BLOCKED = "/bloquear card impedido por dependência externa";
const QUICK_CONFIRM = "/adiar 3d por alinhamento com cliente";
const QUICK_NUDGE = "@responsavel consegue atualizar status até hoje?";

function resolveContextCardId(message: FluxyMessageData, panelCardId: string): string | null {
  const fromMsg = message.contextCardId?.trim() || message.relatedCardId?.trim() || "";
  const fromPanel = panelCardId.trim();
  return fromMsg || fromPanel || null;
}

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

export function BoardFluxyMessagesPanel({ boardId, getHeaders }: { boardId: string; getHeaders: () => Record<string, string> }) {
  const [items, setItems] = useState<FluxyMessageData[]>([]);
  const [draft, setDraft] = useState("");
  const [contextCardId, setContextCardId] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const baseUrl = `/api/boards/${encodeURIComponent(boardId)}/messages`;

  const load = useCallback(async () => {
    const res = await apiFetch(`${baseUrl}?limit=24`, { headers: getApiHeaders(getHeaders()) });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: FluxyMessageData[] };
    const list = Array.isArray(data.items) ? data.items : [];
    setItems(list.slice().reverse());
  }, [baseUrl, getHeaders]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const ev = new EventSource(`${baseUrl}?stream=1`);
    const onCreated = () => {
      void load();
    };
    ev.addEventListener("message.created", onCreated);
    return () => {
      ev.removeEventListener("message.created", onCreated);
      ev.close();
    };
  }, [baseUrl, load, open]);

  const postMessage = useCallback(
    async (input: { body: string; mediatedByFluxy: boolean; contextOverride?: string | null }) => {
      const body = input.body.trim();
      if (!body) return;
      const ctx = (input.contextOverride ?? contextCardId).trim() || null;
      setSending(true);
      try {
        const res = await apiFetch(baseUrl, {
          method: "POST",
          headers: getApiHeaders(getHeaders()),
          body: JSON.stringify({
            body,
            conversationScope: "board",
            mediatedByFluxy: input.mediatedByFluxy,
            ...(ctx ? { contextCardId: ctx } : {}),
          }),
        });
        if (!res.ok) return;
        setDraft("");
        void load();
      } finally {
        setSending(false);
      }
    },
    [baseUrl, contextCardId, getHeaders, load]
  );

  const summary = useMemo(() => {
    if (!items.length) return "Sala Fluxy do board pronta para encaminhamentos.";
    const mentions = items.reduce((acc, m) => acc + m.mentions.length, 0);
    return `${items.length} mensagens recentes e ${mentions} menções roteadas.`;
  }, [items]);

  const applyAdjustForMessage = (m: FluxyMessageData) => {
    const ctx = resolveContextCardId(m, contextCardId);
    if (!ctx) return;
    void postMessage({
      body: `[CONFIRMO APLICAR] ${m.body}`,
      mediatedByFluxy: true,
      contextOverride: ctx,
    });
  };

  const requestConfirmationForMessage = (m: FluxyMessageData) => {
    const ctx = resolveContextCardId(m, contextCardId);
    if (!ctx) return;
    const snippet = m.body.slice(0, 160);
    void postMessage({
      body: `Fluxy: pedir confirmação da equipe antes de alterar o card — "${snippet}${m.body.length > 160 ? "…" : ""}"`,
      mediatedByFluxy: true,
      contextOverride: ctx,
    });
  };

  return (
    <div className="mb-3 rounded-[12px] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] p-2.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--flux-primary-light)]">Sala Fluxy</div>
          <div className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{summary}</div>
        </div>
        <span className="text-[10px] text-[var(--flux-text-muted)]">{open ? "Ocultar" : "Abrir"}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-08)] px-2 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">Resumo rápido</div>
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)] leading-snug">
              Use o ID do card abaixo para ações na sala do board. Menções e políticas da Fluxy usam esse contexto.
            </p>
            <input
              value={contextCardId}
              onChange={(e) => setContextCardId(e.target.value)}
              placeholder="ID do card (opcional)"
              className="mt-1.5 w-full rounded-md border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 font-mono text-[11px] text-[var(--flux-text)] outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDraft(QUICK_BLOCKED)}
                className="rounded-full border border-[var(--flux-primary-alpha-35)] px-2 py-0.5 text-[10px] text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-12)]"
              >
                Marcar como bloqueado
              </button>
              <button
                type="button"
                onClick={() => setDraft(QUICK_CONFIRM)}
                className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
              >
                Pedir confirmação
              </button>
              <button
                type="button"
                onClick={() => setDraft(QUICK_NUDGE)}
                className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
              >
                Cobrar atualização
              </button>
            </div>
          </div>

          <div className="max-h-40 space-y-2 overflow-auto pr-0.5">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--flux-chrome-alpha-12)] px-2 py-3 text-[11px] text-[var(--flux-text-muted)]">
                Nenhuma mensagem ainda.
              </div>
            ) : (
              items.map((m) => {
                const { intent, decision } = classifyFluxyIntentForDisplay(m.body);
                const ctx = resolveContextCardId(m, contextCardId);
                const showCtas = Boolean(m.mediatedByFluxy && intent !== "none" && ctx);
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-2 py-1.5 ${
                      m.mediatedByFluxy ? "border-[var(--flux-primary-alpha-28)] bg-[var(--flux-primary-alpha-06)]" : "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-12)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold text-[var(--flux-text-muted)]">
                        {m.mediatedByFluxy ? "Fluxy" : "Membro"} · {ageLabel(m.createdAt)}
                      </div>
                      {m.contextCardId ? (
                        <span className="shrink-0 rounded-full border border-[var(--flux-chrome-alpha-12)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--flux-text-muted)]">
                          {m.contextCardId}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--flux-text)] line-clamp-3 whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-full border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] px-1.5 py-0.5 text-[9px] text-[var(--flux-text-muted)]">
                        {intent === "none" ? "Sem ação" : intent}
                      </span>
                      {decision === "confirmation_required" ? (
                        <span className="rounded-full border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-1.5 py-0.5 text-[9px] text-[var(--flux-warning)]">
                          Confirmação
                        </span>
                      ) : null}
                    </div>
                    {showCtas ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => applyAdjustForMessage(m)}
                          className="rounded-md bg-[var(--flux-primary)] px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50 hover:bg-[var(--flux-primary-light)]"
                        >
                          Aplicar ajuste
                        </button>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => requestConfirmationForMessage(m)}
                          className="rounded-md border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] disabled:opacity-50 hover:border-[var(--flux-primary-alpha-35)]"
                        >
                          Pedir confirmação
                        </button>
                      </div>
                    ) : m.mediatedByFluxy && intent !== "none" && !ctx ? (
                      <p className="mt-1 text-[9px] text-[var(--flux-text-muted)]">Informe o ID do card acima para usar os botões nesta mensagem.</p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Encaminhar para sala Fluxy… (@nome, /bloquear, /adiar 3d)"
              rows={2}
              maxLength={4000}
              className="w-full resize-none rounded-md border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 text-[11px] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[9px] text-[var(--flux-text-muted)]">{draft.length}/4000</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void postMessage({ body: draft, mediatedByFluxy: false })}
                  disabled={!draft.trim() || sending}
                  className="rounded-md border border-[var(--flux-chrome-alpha-14)] px-2 py-1 text-[10px] text-[var(--flux-text-muted)] disabled:opacity-50"
                >
                  Membro
                </button>
                <button
                  type="button"
                  onClick={() => void postMessage({ body: draft, mediatedByFluxy: true })}
                  disabled={!draft.trim() || sending}
                  className="rounded-md bg-[var(--flux-primary)] px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                >
                  {sending ? "…" : "Fluxy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
