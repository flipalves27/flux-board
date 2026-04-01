"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { FluxyMessageData } from "@/lib/schemas";
import { classifyFluxyIntentForDisplay } from "@/lib/fluxy-message-intent";
import type { FluxyBoardDockIntent } from "@/stores/copilot-store";

const QUICK_BLOCKED = "/bloquear card impedido por dependência externa";
const QUICK_CONFIRM = "/adiar 3d por alinhamento com cliente";
const QUICK_NUDGE = "@responsavel consegue atualizar status até hoje?";
const QUICK_NOTIFY_ASSIGNEE = "Fluxy: avisa o responsável que precisamos de uma atualização sobre este card.";
const QUICK_NOTIFY_BLOCKED = "Fluxy: notifica o responsável que o card está bloqueado e precisa de desbloqueio.";

const LS_SALA_OPEN = "flux-board.sala-fluxy.expanded";
const SS_SALA_PREFILL = "flux-board.sala-prefill";

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

type PostInput = { body: string; mediatedByFluxy: boolean; contextOverride?: string | null; confirmFluxyNotify?: boolean };

export function BoardFluxyMessagesPanel({
  boardId,
  getHeaders,
  embedded = false,
  deepLinkIntent = null,
  salaActive = true,
}: {
  boardId: string;
  getHeaders: () => Record<string, string>;
  embedded?: boolean;
  deepLinkIntent?: FluxyBoardDockIntent | null;
  /** Quando embutido em tabs, só consome prefill com a aba Sala visível. */
  salaActive?: boolean;
}) {
  const t = useTranslations("kanban.board.fluxyCopilot");
  const [items, setItems] = useState<FluxyMessageData[]>([]);
  const [draft, setDraft] = useState("");
  const [contextCardId, setContextCardId] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingNotify, setPendingNotify] = useState<PostInput | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const baseUrl = `/api/boards/${encodeURIComponent(boardId)}/messages`;

  useEffect(() => {
    if (embedded) return;
    try {
      if (localStorage.getItem(LS_SALA_OPEN) === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [embedded]);

  const setOpenPersist = useCallback((next: boolean) => {
    setOpen(next);
    if (embedded) return;
    try {
      localStorage.setItem(LS_SALA_OPEN, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [embedded]);

  const load = useCallback(async () => {
    const res = await apiFetch(`${baseUrl}?limit=24`, { headers: getApiHeaders(getHeaders()) });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: FluxyMessageData[] };
    const list = Array.isArray(data.items) ? data.items : [];
    setItems(list.slice().reverse());
  }, [baseUrl, getHeaders]);

  const isContentVisible = embedded || open;

  useEffect(() => {
    if (!isContentVisible) return;
    void load();
  }, [load, isContentVisible]);

  useEffect(() => {
    if (!isContentVisible) return;
    const ev = new EventSource(`${baseUrl}?stream=1`);
    const onCreated = () => {
      void load();
    };
    ev.addEventListener("message.created", onCreated);
    return () => {
      ev.removeEventListener("message.created", onCreated);
      ev.close();
    };
  }, [baseUrl, load, isContentVisible]);

  useEffect(() => {
    if (!deepLinkIntent) return;
    if (deepLinkIntent.contextCardId) setContextCardId(deepLinkIntent.contextCardId);
    if (deepLinkIntent.highlightMessageId) setHighlightId(deepLinkIntent.highlightMessageId);
    if (deepLinkIntent.focusComposer) {
      const id = window.requestAnimationFrame(() => composerRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [deepLinkIntent]);

  useEffect(() => {
    if (embedded && !salaActive) return;
    if (!embedded && !open) return;
    try {
      const v = sessionStorage.getItem(SS_SALA_PREFILL);
      if (v) {
        sessionStorage.removeItem(SS_SALA_PREFILL);
        setDraft(v);
        requestAnimationFrame(() => composerRef.current?.focus());
      }
    } catch {
      /* ignore */
    }
  }, [embedded, salaActive, open]);

  useEffect(() => {
    if (!highlightId || !items.length) return;
    const el = rowRefs.current.get(highlightId);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightId, items]);

  const postMessage = useCallback(
    async (input: PostInput) => {
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
            confirmFluxyNotify: input.confirmFluxyNotify === true,
            ...(ctx ? { contextCardId: ctx } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        if (res.status === 409 && data?.code === "FLUXY_NOTIFY_CONFIRM") {
          setPendingNotify({ body, mediatedByFluxy: input.mediatedByFluxy, contextOverride: input.contextOverride });
          return;
        }
        if (!res.ok) return;
        setPendingNotify(null);
        setDraft("");
        void load();
      } finally {
        setSending(false);
      }
    },
    [baseUrl, contextCardId, getHeaders, load]
  );

  const confirmPendingNotify = useCallback(() => {
    if (!pendingNotify) return;
    void postMessage({ ...pendingNotify, confirmFluxyNotify: true });
  }, [pendingNotify, postMessage]);

  const summary = useMemo(() => {
    if (!items.length) return t("salaSummaryEmpty");
    const mentions = items.reduce((acc, m) => acc + m.mentions.length, 0);
    return t("salaSummaryWithCounts", { count: items.length, mentions });
  }, [items, t]);

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

  const inner = (
    <div className="mt-2 space-y-2">
      <p className="text-[10px] text-[var(--flux-text-muted)] leading-snug">{t("notifyPipelineHint")}</p>

      {pendingNotify ? (
        <div className="rounded-lg border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-2 py-2">
          <div className="text-[10px] font-bold text-[var(--flux-warning)]">{t("notifyConfirmTitle")}</div>
          <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">{t("notifyConfirmBody")}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={sending}
              onClick={() => setPendingNotify(null)}
              className="rounded-md border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)]"
            >
              {t("notifyConfirmCancel")}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => confirmPendingNotify()}
              className="rounded-md bg-[var(--flux-primary)] px-2 py-0.5 text-[10px] font-semibold text-white"
            >
              {t("notifyConfirmSend")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-08)] px-2 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("salaQuickTitle")}</div>
        <p className="mt-1 text-[11px] text-[var(--flux-text-muted)] leading-snug">{t("salaQuickDesc")}</p>
        <input
          value={contextCardId}
          onChange={(e) => setContextCardId(e.target.value)}
          placeholder={t("salaContextPlaceholder")}
          className="mt-1.5 w-full rounded-md border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1.5 font-mono text-[11px] text-[var(--flux-text)] outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setDraft(QUICK_BLOCKED)}
            className="rounded-full border border-[var(--flux-primary-alpha-35)] px-2 py-0.5 text-[10px] text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-12)]"
          >
            {t("chipBlocked")}
          </button>
          <button
            type="button"
            onClick={() => setDraft(QUICK_CONFIRM)}
            className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
          >
            {t("chipDelay")}
          </button>
          <button
            type="button"
            onClick={() => setDraft(QUICK_NUDGE)}
            className="rounded-full border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
          >
            {t("chipNudge")}
          </button>
          <button
            type="button"
            onClick={() => setDraft(QUICK_NOTIFY_ASSIGNEE)}
            className="rounded-full border border-[var(--flux-secondary-alpha-35)] px-2 py-0.5 text-[10px] text-[var(--flux-secondary)] hover:bg-[var(--flux-secondary-alpha-08)]"
          >
            {t("chipNotifyAssignee")}
          </button>
          <button
            type="button"
            onClick={() => setDraft(QUICK_NOTIFY_BLOCKED)}
            className="rounded-full border border-[var(--flux-secondary-alpha-35)] px-2 py-0.5 text-[10px] text-[var(--flux-secondary)] hover:bg-[var(--flux-secondary-alpha-08)]"
          >
            {t("chipNotifyBlocked")}
          </button>
        </div>
      </div>

      <div className="max-h-40 space-y-2 overflow-auto pr-0.5">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--flux-chrome-alpha-12)] px-2 py-3 text-[11px] text-[var(--flux-text-muted)]">
            {t("salaNoMessages")}
          </div>
        ) : (
          items.map((m) => {
            const { intent, decision } = classifyFluxyIntentForDisplay(m.body);
            const ctx = resolveContextCardId(m, contextCardId);
            const showCtas = Boolean(m.mediatedByFluxy && intent !== "none" && ctx);
            const hi = highlightId === m.id;
            return (
              <div
                key={m.id}
                ref={(el) => {
                  rowRefs.current.set(m.id, el);
                }}
                className={`rounded-lg border px-2 py-1.5 ${
                  hi ? "ring-1 ring-[var(--flux-primary)] border-[var(--flux-primary-alpha-45)]" : ""
                } ${
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
                    {intent === "none" ? t("intentNone") : intent}
                  </span>
                  {decision === "confirmation_required" ? (
                    <span className="rounded-full border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-1.5 py-0.5 text-[9px] text-[var(--flux-warning)]">
                      {t("badgeConfirmation")}
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
                      {t("ctaApply")}
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => requestConfirmationForMessage(m)}
                      className="rounded-md border border-[var(--flux-chrome-alpha-14)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)] disabled:opacity-50 hover:border-[var(--flux-primary-alpha-35)]"
                    >
                      {t("ctaAskConfirm")}
                    </button>
                  </div>
                ) : m.mediatedByFluxy && intent !== "none" && !ctx ? (
                  <p className="mt-1 text-[9px] text-[var(--flux-text-muted)]">{t("needCardIdForCtas")}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-1.5">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("salaComposerPlaceholder")}
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
              {t("sendAsMember")}
            </button>
            <button
              type="button"
              onClick={() => void postMessage({ body: draft, mediatedByFluxy: true })}
              disabled={!draft.trim() || sending}
              className="rounded-md bg-[var(--flux-primary)] px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              {sending ? "…" : t("sendAsFluxy")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="mb-1 rounded-[12px] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--flux-primary-light)]">{t("salaTitle")}</div>
        <div className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{summary}</div>
        {inner}
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-[12px] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] p-2.5">
      <button type="button" onClick={() => setOpenPersist(!open)} className="flex w-full items-center justify-between text-left">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--flux-primary-light)]">{t("salaTitle")}</div>
          <div className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{summary}</div>
        </div>
        <span className="text-[10px] text-[var(--flux-text-muted)]">{open ? t("salaCollapse") : t("salaExpand")}</span>
      </button>
      {open ? inner : null}
    </div>
  );
}
