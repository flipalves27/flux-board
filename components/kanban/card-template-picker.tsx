"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { CardTemplate } from "@/lib/kv-card-templates";

interface CardTemplatePickerProps {
  getHeaders: () => Record<string, string>;
  onSelect: (template: CardTemplate) => void;
  onBlank: () => void;
  onClose: () => void;
}

export function CardTemplatePicker({ getHeaders, onSelect, onBlank, onClose }: CardTemplatePickerProps) {
  const t = useTranslations("kanban.cardTemplates");
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/card-templates", { headers: getApiHeaders(getHeaders()) });
        const data = await res.json();
        if (!cancelled) setTemplates(data.templates ?? []);
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getHeaders]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/card-templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getApiHeaders(getHeaders()),
      });
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    } catch {
      /* empty */
    } finally {
      setDeletingId(null);
    }
  }, [getHeaders]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-modal-depth)] overflow-hidden"
    >
      <button
        type="button"
        onClick={onBlank}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--flux-chrome-alpha-06)] text-xs text-[var(--flux-text-muted)]">+</span>
        {t("blankCard")}
      </button>

      <div className="h-px bg-[var(--flux-chrome-alpha-08)]" />

      <div className="px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
          {t("createFromTemplate")}
        </p>
      </div>

      {loading ? (
        <div className="px-3 pb-3">
          <div className="h-8 w-full animate-pulse rounded-lg bg-[var(--flux-chrome-alpha-06)]" />
        </div>
      ) : templates.length === 0 ? (
        <div className="px-3 pb-3 text-center">
          <p className="text-sm text-[var(--flux-text-muted)]">{t("noTemplates")}</p>
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]/60">{t("noTemplatesHint")}</p>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto scrollbar-kanban pb-1">
          {templates.map((tpl) => (
            <div key={tpl.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-[var(--flux-surface-hover)] transition-colors">
              <button
                type="button"
                onClick={() => onSelect(tpl)}
                className="flex-1 text-left min-w-0"
              >
                <p className="truncate text-sm font-medium text-[var(--flux-text)]">{tpl.name}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--flux-text-muted)]">{tpl.title}</p>
                {tpl.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tpl.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded-full bg-[var(--flux-primary-alpha-12)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--flux-primary-light)]"
                      >
                        {tag}
                      </span>
                    ))}
                    {tpl.tags.length > 3 && (
                      <span className="text-[10px] text-[var(--flux-text-muted)]">+{tpl.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                disabled={deletingId === tpl.id}
                className="shrink-0 rounded p-1 text-[var(--flux-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--flux-danger)]"
                aria-label={t("delete")}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
