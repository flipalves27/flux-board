"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, apiGet, getApiHeaders, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useOrgFeaturesOptional } from "@/context/org-features-context";
import { nextBoardCardId } from "@/lib/card-id";
import type { CardData } from "@/app/board/[id]/page";
import type { DiscoveryCardDraft } from "@/lib/kv-discovery-sessions";

type BucketLite = { key: string; label: string };

type SessionRow = {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  boardTitleSnapshot: string;
  docId?: string | null;
  cardDrafts?: DiscoveryCardDraft[] | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  bucketOrder: BucketLite[];
  priorities: readonly string[];
  progresses: readonly string[];
  getHeaders: () => Record<string, string>;
  onBoardReload: () => void | Promise<void>;
};

export function BoardDiscoverySessionsModal({
  open,
  onClose,
  boardId,
  bucketOrder,
  priorities,
  progresses,
  getHeaders,
  onBoardReload,
}: Props) {
  const t = useTranslations("board.discoverySessions");
  const locale = useLocale();
  const { pushToast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const features = useOrgFeaturesOptional();
  const canFluxDocs = Boolean(features?.data?.flux_docs);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewDrafts, setPreviewDrafts] = useState<DiscoveryCardDraft[]>([]);
  const [pick, setPick] = useState<Record<number, boolean>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeRef });

  const defaultProgress = useMemo(
    () => (progresses.includes("Não iniciado") ? "Não iniciado" : progresses[0] ?? "Não iniciado"),
    [progresses]
  );

  const statusLabels = useMemo(
    () => ({
      open: t("status.open"),
      submitted: t("status.submitted"),
      processed: t("status.processed"),
      draft: t("status.draft"),
      archived: t("status.archived"),
    }),
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/discovery-sessions`, {
        headers: getApiHeaders(getHeaders()),
        cache: "no-store",
      });
      if (!res.ok) throw new ApiError("load", res.status);
      const j = (await res.json()) as { sessions?: SessionRow[] };
      setSessions(Array.isArray(j.sessions) ? j.sessions : []);
    } catch {
      setSessions([]);
      pushToast({ kind: "error", title: t("loadError") });
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, pushToast, t]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const createSession = async () => {
    setCreating(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/discovery-sessions`, {
        method: "POST",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || t("createError"));
      }
      const j = (await res.json()) as { shareUrl?: string };
      if (j.shareUrl) setLastShareUrl(j.shareUrl);
      pushToast({ kind: "success", title: t("createOk") });
      await load();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : t("createError") });
    } finally {
      setCreating(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ kind: "success", title: t("copied") });
    } catch {
      pushToast({ kind: "error", title: t("copyFailed") });
    }
  };

  const generateFor = async (sessionId: string) => {
    if (!canFluxDocs) {
      pushToast({ kind: "error", title: t("planGate") });
      return;
    }
    setGeneratingId(sessionId);
    setPreviewSessionId(null);
    setPreviewDrafts([]);
    setPick({});
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(boardId)}/discovery-sessions/${encodeURIComponent(sessionId)}/generate`,
        { method: "POST", headers: getApiHeaders(getHeaders()) }
      );
      const j = (await res.json()) as { cardDrafts?: DiscoveryCardDraft[]; error?: string };
      if (!res.ok) throw new Error(j.error || t("generateError"));
      const drafts = Array.isArray(j.cardDrafts) ? j.cardDrafts : [];
      setPreviewSessionId(sessionId);
      setPreviewDrafts(drafts);
      const init: Record<number, boolean> = {};
      drafts.forEach((_, i) => {
        init[i] = true;
      });
      setPick(init);
      pushToast({ kind: "success", title: t("generateOk") });
      await load();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : t("generateError") });
    } finally {
      setGeneratingId(null);
    }
  };

  const patchDraft = (index: number, patch: Partial<DiscoveryCardDraft>) => {
    setPreviewDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const applyCards = async () => {
    if (!previewSessionId || !previewDrafts.length) return;
    const chosen = previewDrafts.filter((_, i) => pick[i]);
    if (!chosen.length) {
      pushToast({ kind: "error", title: t("pickOne") });
      return;
    }
    setApplying(true);
    try {
      const board = await apiGet<{ cards?: CardData[] }>(`/api/boards/${encodeURIComponent(boardId)}`, getHeaders());
      const existing = Array.isArray(board.cards) ? board.cards : [];
      const byBucket = new Map<string, number>();
      for (const c of existing) {
        const k = String(c.bucket || "");
        byBucket.set(k, (byBucket.get(k) ?? 0) + 1);
      }
      const idPool: string[] = existing.map((c) => c.id);
      const newCards: CardData[] = [...existing];
      for (const d of chosen) {
        const bucket = bucketOrder.some((b) => b.key === d.bucketKey) ? d.bucketKey : bucketOrder[0]?.key || d.bucketKey;
        const ord = byBucket.get(bucket) ?? 0;
        byBucket.set(bucket, ord + 1);
        const pr = priorities.includes(String(d.priority)) ? d.priority : priorities[0] ?? "Média";
        const nid = nextBoardCardId(idPool);
        idPool.push(nid);
        const card: CardData = {
          id: nid,
          bucket,
          priority: String(pr),
          progress: defaultProgress,
          title: String(d.title || "").trim().slice(0, 300),
          desc: String(d.description || "").trim(),
          tags: Array.isArray(d.tags) ? d.tags.map(String).filter(Boolean).slice(0, 20) : [],
          direction: null,
          dueDate: d.dueDate && String(d.dueDate).trim() ? String(d.dueDate).trim().slice(0, 32) : null,
          order: ord,
        };
        newCards.push(card);
      }

      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}`, {
        method: "PUT",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ cards: newCards }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || t("applyError"));
      }
      pushToast({ kind: "success", title: t("applyOk") });
      setPreviewSessionId(null);
      setPreviewDrafts([]);
      setPick({});
      await onBoardReload();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : t("applyError") });
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-kanban-modal-stack)] flex items-center justify-center p-4 bg-black/50"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discovery-sessions-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--flux-border-default)]">
          <div>
            <h2 id="discovery-sessions-title" className="text-base font-semibold text-[var(--flux-text)]">
              {t("title")}
            </h2>
            <p className="text-sm text-[var(--flux-text-muted)] mt-1">{t("hint")}</p>
          </div>
          <button ref={closeRef} type="button" className="btn-ghost text-sm shrink-0" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!canFluxDocs ? (
            <p className="text-sm text-[var(--flux-warning)] rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)] px-3 py-2">
              {t("planGate")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" disabled={creating} onClick={() => void createSession()}>
              {creating ? t("creating") : t("newSession")}
            </button>
            {lastShareUrl ? (
              <>
                <button type="button" className="btn-secondary text-sm" onClick={() => void copyText(lastShareUrl)}>
                  {t("copyLastLink")}
                </button>
                <span className="text-xs text-[var(--flux-text-muted)] break-all self-center">{lastShareUrl}</span>
              </>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--flux-text)]">
                      {s.boardTitleSnapshot}{" "}
                      <span className="text-[var(--flux-text-muted)] font-normal">· {s.id}</span>
                    </div>
                    <div className="text-xs text-[var(--flux-text-muted)] mt-0.5">
                      {t("statusLabel")}: {statusLabels[s.status as keyof typeof statusLabels] ?? s.status}{" "}
                      · {t("expires")}: {new Date(s.expiresAt).toLocaleString(locale)}
                    </div>
                    {s.docId ? (
                      <div className="text-xs text-[var(--flux-text-muted)] mt-0.5">
                        {t("doc")}: {s.docId}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      className="btn-secondary text-xs py-1.5 px-2"
                      disabled={s.status !== "submitted" && s.status !== "processed"}
                      onClick={() => void generateFor(s.id)}
                    >
                      {generatingId === s.id ? t("generating") : t("generate")}
                    </button>
                  </div>
                </li>
              ))}
              {!sessions.length ? <li className="text-sm text-[var(--flux-text-muted)]">{t("empty")}</li> : null}
            </ul>
          )}

          {previewDrafts.length ? (
            <div className="border-t border-[var(--flux-border-default)] pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--flux-text)]">{t("previewTitle")}</h3>
              {previewDrafts.map((d, i) => (
                <div key={i} className="rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(pick[i])}
                      onChange={(e) => setPick((p) => ({ ...p, [i]: e.target.checked }))}
                    />
                    <span className="sr-only">{t("includeCard")}</span>
                  </label>
                  <input
                    className="w-full text-sm rounded border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-2 py-1"
                    value={d.title}
                    onChange={(e) => patchDraft(i, { title: e.target.value })}
                  />
                  <textarea
                    className="w-full text-sm rounded border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-2 py-1 min-h-[72px]"
                    value={d.description}
                    onChange={(e) => patchDraft(i, { description: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="text-sm rounded border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-2 py-1"
                      value={d.bucketKey}
                      onChange={(e) => patchDraft(i, { bucketKey: e.target.value })}
                    >
                      {bucketOrder.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="text-sm rounded border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-2 py-1"
                      value={d.priority}
                      onChange={(e) => patchDraft(i, { priority: e.target.value })}
                    >
                      {priorities.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="text-sm rounded border border-[var(--flux-border-default)] bg-[var(--flux-surface)] px-2 py-1"
                      value={d.dueDate ? String(d.dueDate).slice(0, 10) : ""}
                      onChange={(e) => patchDraft(i, { dueDate: e.target.value ? e.target.value : null })}
                    />
                  </div>
                </div>
              ))}
              <button type="button" className="btn-primary text-sm" disabled={applying} onClick={() => void applyCards()}>
                {applying ? t("applying") : t("apply")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
