"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

type BucketLite = { key: string; label: string };

type IntakeFormShape = {
  enabled?: boolean;
  slug?: string;
  title?: string;
  description?: string;
  targetBucketKey?: string;
  defaultPriority?: string;
  defaultProgress?: string;
  defaultTags?: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  bucketOrder: BucketLite[];
  priorities: readonly string[];
  progresses: readonly string[];
  getHeaders: () => Record<string, string>;
  formOrigin: string;
  onSaved: () => void | Promise<void>;
};

export function BoardIntakeFormsModal({
  open,
  onClose,
  boardId,
  bucketOrder,
  priorities,
  progresses,
  getHeaders,
  formOrigin,
  onSaved,
}: Props) {
  const t = useTranslations("board.intakeForm");
  const locale = useLocale();
  const { pushToast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetBucketKey, setTargetBucketKey] = useState("");
  const [defaultPriority, setDefaultPriority] = useState(priorities[0] ?? "Média");
  const [defaultProgress, setDefaultProgress] = useState(progresses[0] ?? "Não iniciado");
  const [defaultTagsRaw, setDefaultTagsRaw] = useState("");

  useModalA11y({ open, onClose, containerRef: dialogRef, initialFocusRef: closeRef });

  const applyForm = useCallback(
    (f: IntakeFormShape | null | undefined) => {
      const firstKey = bucketOrder[0]?.key ?? "";
      if (!f || typeof f !== "object") {
        setEnabled(true);
        setSlug("");
        setTitle("");
        setDescription("");
        setTargetBucketKey(firstKey);
        setDefaultPriority(priorities.includes("Média") ? "Média" : priorities[0] ?? "Média");
        setDefaultProgress(progresses.includes("Não iniciado") ? "Não iniciado" : progresses[0] ?? "Não iniciado");
        setDefaultTagsRaw("");
        return;
      }
      setEnabled(f.enabled !== false);
      setSlug(String(f.slug ?? "").trim());
      setTitle(String(f.title ?? "").trim());
      setDescription(String(f.description ?? "").trim());
      const tk = String(f.targetBucketKey ?? "").trim();
      setTargetBucketKey(bucketOrder.some((b) => b.key === tk) ? tk : firstKey);
      const dp = String(f.defaultPriority ?? "").trim();
      setDefaultPriority(priorities.includes(dp) ? dp : priorities[0] ?? "Média");
      const prog = String(f.defaultProgress ?? "").trim();
      setDefaultProgress(progresses.includes(prog) ? prog : progresses[0] ?? "Não iniciado");
      setDefaultTagsRaw(Array.isArray(f.defaultTags) ? f.defaultTags.join(", ") : "");
    },
    [bucketOrder, priorities, progresses]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/forms`, {
          headers: getApiHeaders(getHeaders()),
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { intakeForm?: IntakeFormShape | null };
        if (!cancelled) applyForm(j.intakeForm);
      } catch {
        if (!cancelled) applyForm(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, getHeaders, applyForm]);

  const formLink =
    formOrigin && slug.trim().length >= 3
      ? `${formOrigin}/${locale}/forms/${encodeURIComponent(slug.trim())}`
      : "";

  const canSave =
    slug.trim().length >= 3 &&
    title.trim().length >= 1 &&
    Boolean(targetBucketKey) &&
    bucketOrder.some((b) => b.key === targetBucketKey);

  const save = async () => {
    if (!canSave) {
      pushToast({ kind: "error", title: t("validationError") });
      return;
    }
    setSaving(true);
    try {
      const defaultTags = defaultTagsRaw
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/forms`, {
        method: "PUT",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim() || null,
          targetBucketKey,
          defaultPriority,
          defaultProgress,
          defaultTags,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        pushToast({ kind: "error", title: data.error ?? t("saveError") });
        return;
      }
      pushToast({ kind: "success", title: t("saveOk") });
      await onSaved();
      onClose();
    } catch {
      pushToast({ kind: "error", title: t("saveError") });
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!formLink) return;
    try {
      await navigator.clipboard.writeText(formLink);
      pushToast({ kind: "success", title: t("linkCopied") });
    } catch {
      pushToast({ kind: "error", title: t("linkCopyFailed") });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-anomaly-modal)] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-forms-modal-title"
        className="w-full max-w-lg rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-lg)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-chrome-alpha-10)] px-5 py-4">
          <div>
            <h2 id="intake-forms-modal-title" className="font-display text-base font-bold text-[var(--flux-text)]">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{t("hint")}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{t("journeyHint")}</p>
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

        <div className="max-h-[min(72vh,480px)] space-y-3 overflow-y-auto px-5 py-4">
          {loading ? <p className="text-xs text-[var(--flux-text-muted)]">{t("loading")}</p> : null}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--flux-text)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-[var(--flux-control-border)]"
            />
            {t("enabled")}
          </label>

          <div>
            <label htmlFor="intake-slug" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("slug")}
            </label>
            <input
              id="intake-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={80}
              placeholder={t("slugPlaceholder")}
              className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]"
            />
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("slugHint")}</p>
          </div>

          <div>
            <label htmlFor="intake-title" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("formTitle")}
            </label>
            <input
              id="intake-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder={t("formTitlePlaceholder")}
              className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]"
            />
          </div>

          <div>
            <label htmlFor="intake-desc" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("description")}
            </label>
            <textarea
              id="intake-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder={t("descriptionPlaceholder")}
              className="mt-1 w-full resize-y rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-xs text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]"
            />
          </div>

          <div>
            <label htmlFor="intake-bucket" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("targetBucket")}
            </label>
            <select
              id="intake-bucket"
              value={targetBucketKey}
              onChange={(e) => setTargetBucketKey(e.target.value)}
              className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
            >
              {bucketOrder.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label} ({b.key})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="intake-prio" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
                {t("defaultPriority")}
              </label>
              <select
                id="intake-prio"
                value={defaultPriority}
                onChange={(e) => setDefaultPriority(e.target.value)}
                className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intake-prog" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
                {t("defaultProgress")}
              </label>
              <select
                id="intake-prog"
                value={defaultProgress}
                onChange={(e) => setDefaultProgress(e.target.value)}
                className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
              >
                {progresses.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="intake-tags" className="text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">
              {t("defaultTags")}
            </label>
            <input
              id="intake-tags"
              value={defaultTagsRaw}
              onChange={(e) => setDefaultTagsRaw(e.target.value)}
              placeholder={t("defaultTagsPlaceholder")}
              className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]"
            />
          </div>

          {formLink ? (
            <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] p-3">
              <p className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("publicUrl")}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-[var(--flux-primary-light)]">{formLink}</p>
              <button type="button" onClick={() => void copyLink()} className="btn-secondary mt-2 text-xs">
                {t("copyLink")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--flux-chrome-alpha-10)] px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("cancel")}
          </button>
          <button type="button" disabled={saving || !canSave} onClick={() => void save()} className="btn-primary">
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
