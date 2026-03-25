"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { useToast } from "@/context/toast-context";
import { apiFetch, getApiHeaders } from "@/lib/api-client";

export function CardSaveAsTemplateDialog({ onClose }: { onClose: () => void }) {
  const { card, title, priority, tags, descriptionForSave, getHeaders } = useCardModal();
  const t = useTranslations("kanban.cardTemplates");
  const { pushToast } = useToast();
  const [name, setName] = useState(title || card.title || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        title: title || card.title,
        description: descriptionForSave || card.desc,
        tags: [...tags],
        priority: priority || card.priority,
        subtasks: (card as Record<string, unknown>).subtasks ?? undefined,
      };
      await apiFetch("/api/card-templates", {
        method: "POST",
        body: JSON.stringify(body),
        headers: getApiHeaders(getHeaders()),
      });
      pushToast({ kind: "success", title: t("saved") });
      onClose();
    } catch {
      pushToast({ kind: "error", title: "Error" });
    } finally {
      setSaving(false);
    }
  }, [name, title, card, descriptionForSave, tags, priority, getHeaders, pushToast, t, onClose]);

  return (
    <div className="fixed inset-0 z-[calc(var(--flux-z-modal-base)+10)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-md rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-modal-depth)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-bold text-[var(--flux-text)]">{t("saveAsTemplate")}</h3>
        <label className="mt-4 block text-sm font-medium text-[var(--flux-text-muted)]">
          {t("templateName")}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          className="mt-1.5 w-full rounded-xl border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]/50 focus:border-[var(--flux-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--flux-primary)]"
          autoFocus
        />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "…" : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
