"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import {
  ANOMALY_NOTIFY_KIND_OPTIONS,
  type BoardAnomalyNotifications,
} from "@/lib/anomaly-board-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  initial: BoardAnomalyNotifications | undefined;
  getHeaders: () => Record<string, string>;
  onSaved: (next: BoardAnomalyNotifications | undefined) => void;
};

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
}

export function BoardAnomalyNotificationsModal({ open, onClose, boardId, initial, getHeaders, onSaved }: Props) {
  const t = useTranslations("board.anomalyAlerts");
  const { pushToast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(initial?.emailEnabled !== false);
  const [minSeverity, setMinSeverity] = useState<"warning" | "critical">(initial?.minSeverity ?? "warning");
  const [kinds, setKinds] = useState<Set<string>>(() => new Set(initial?.notifyKinds ?? []));
  const [emailsRaw, setEmailsRaw] = useState(() => (initial?.recipientEmails ?? []).join(", "));
  const [busy, setBusy] = useState(false);

  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeRef });

  useEffect(() => {
    if (!open) return;
    setEmailEnabled(initial?.emailEnabled !== false);
    setMinSeverity(initial?.minSeverity ?? "warning");
    setKinds(new Set(initial?.notifyKinds ?? []));
    setEmailsRaw((initial?.recipientEmails ?? []).join(", "));
  }, [open, initial]);

  const allKeys = [...ANOMALY_NOTIFY_KIND_OPTIONS];

  const toggleKind = (k: string) => {
    setKinds((prev) => {
      if (prev.size === 0) {
        return new Set(allKeys.filter((x) => x !== k));
      }
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      if (next.size === allKeys.length) return new Set();
      return next;
    });
  };

  const selectAllKinds = () => setKinds(new Set());

  const save = async () => {
    setBusy(true);
    try {
      const recipientEmails = parseEmails(emailsRaw);
      const body: BoardAnomalyNotifications = {
        emailEnabled,
        minSeverity,
        recipientEmails: recipientEmails.length ? recipientEmails : undefined,
        notifyKinds:
          kinds.size === 0 ? undefined : (Array.from(kinds) as BoardAnomalyNotifications["notifyKinds"]),
      };
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getApiHeaders(getHeaders()) },
        body: JSON.stringify({ anomalyNotifications: body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || t("saveError"));
      }
      onSaved(body);
      pushToast({ kind: "success", title: t("saveOk") });
      onClose();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof Error ? e.message : t("saveError") });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-anomaly-modal)] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anomaly-modal-title"
        className="w-full max-w-lg rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-lg)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-chrome-alpha-10)] px-5 py-4">
          <div>
            <h2 id="anomaly-modal-title" className="font-display text-base font-bold text-[var(--flux-text)]">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{t("hint")}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-[var(--flux-rad-sm)] px-2 py-1 text-sm text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-10)] hover:text-[var(--flux-text)]"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[min(70vh,420px)] space-y-4 overflow-y-auto px-5 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--flux-text)]">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="rounded border-[var(--flux-control-border)]"
            />
            {t("emailEnabled")}
          </label>

          <div>
            <label htmlFor="anomaly-min-sev" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("minSeverity")}
            </label>
            <select
              id="anomaly-min-sev"
              value={minSeverity}
              onChange={(e) => setMinSeverity(e.target.value as "warning" | "critical")}
              className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
            >
              <option value="warning">{t("sevWarning")}</option>
              <option value="critical">{t("sevCritical")}</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">{t("kinds")}</span>
              <button type="button" onClick={selectAllKinds} className="text-[11px] font-semibold text-[var(--flux-primary-light)] hover:underline">
                {t("allKinds")}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("kindsHint")}</p>
            <ul className="mt-2 space-y-1.5">
              {ANOMALY_NOTIFY_KIND_OPTIONS.map((k) => (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--flux-text)]">
                    <input
                      type="checkbox"
                      checked={kinds.size === 0 || kinds.has(k)}
                      onChange={() => toggleKind(k)}
                      className="rounded border-[var(--flux-control-border)]"
                    />
                    <span className="font-mono text-[10px] text-[var(--flux-text-muted)]">{k}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label htmlFor="anomaly-emails" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("recipients")}
            </label>
            <textarea
              id="anomaly-emails"
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              rows={2}
              placeholder={t("recipientsPlaceholder")}
              className="mt-1 w-full resize-y rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-xs text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]"
            />
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("recipientsHint")}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--flux-chrome-alpha-10)] px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("cancel")}
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary">
            {busy ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
