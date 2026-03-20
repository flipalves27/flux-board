"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiPost, ApiError } from "@/lib/api-client";
import type { TemplateCategory } from "@/lib/template-types";

const CATEGORIES: TemplateCategory[] = [
  "sales",
  "operations",
  "projects",
  "hr",
  "marketing",
  "customer_success",
  "support",
  "insurance_warranty",
];

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

export function BoardTemplateExportModal({ open, onClose, boardId, getHeaders }: Props) {
  const t = useTranslations("templates");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("operations");
  const [pricingTier, setPricingTier] = useState<"free" | "premium">("free");
  const [phase, setPhase] = useState<"idle" | "publishing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  if (!open) return null;

  async function publish() {
    setError(null);
    setPhase("publishing");
    try {
      const res = await apiPost<{ template: { slug: string } }>(
        `/api/boards/${encodeURIComponent(boardId)}/export-template`,
        { title: title.trim() || "Template", description: description.trim(), category, pricingTier },
        getHeaders()
      );
      setPublishedSlug(res?.template?.slug ?? null);
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof ApiError ? e.message : "Erro ao publicar.");
    }
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.25)] bg-[var(--flux-surface-card)] shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-6">
        <h2 className="text-lg font-semibold text-[var(--flux-text)] font-display">{t("exportModal.title")}</h2>
        <p className="text-sm text-[var(--flux-text-muted)] mt-1 mb-4">{t("exportModal.hint")}</p>

        {error && (
          <div className="mb-3 text-sm text-[var(--flux-danger)] border border-[rgba(255,107,107,0.35)] rounded-[var(--flux-rad)] px-3 py-2">
            {error}
          </div>
        )}

        {phase === "done" ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--flux-secondary)]">{t("exportModal.done")}</p>
            {publishedSlug && (
              <p className="text-xs text-[var(--flux-text-muted)] font-mono break-all">
                slug: {publishedSlug}
              </p>
            )}
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.fieldTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
              placeholder={t("exportModal.titlePlaceholder")}
            />
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.fieldDesc")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full mb-3 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
            />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.category")}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`exportModal.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.pricing")}</label>
                <select
                  value={pricingTier}
                  onChange={(e) => setPricingTier(e.target.value as "free" | "premium")}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  <option value="free">{t("exportModal.free")}</option>
                  <option value="premium">{t("exportModal.premium")}</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-[var(--flux-text-muted)] mb-4">{t("exportModal.revenueHint")}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={phase === "publishing"}>
                {t("exportModal.cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={() => void publish()} disabled={phase === "publishing"}>
                {phase === "publishing" ? t("exportModal.publishing") : t("exportModal.publish")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
