"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { detectAutomationPatterns, type AutomationSuggestion } from "@/lib/automation-suggestions";

const STORAGE_KEY = "flux-board.dismissed-automation-suggestions";

function loadDismissed(boardId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const map: Record<string, string[]> = JSON.parse(raw);
    return new Set(map[boardId] ?? []);
  } catch {
    return new Set();
  }
}

function persistDismissed(boardId: string, ids: Set<string>) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    map[boardId] = [...ids].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export interface BoardAutomationSuggestionsProps {
  boardId: string;
  cards: CardData[];
  buckets: BucketConfig[];
}

export function BoardAutomationSuggestions({
  boardId,
  cards,
  buckets,
}: BoardAutomationSuggestionsProps) {
  const t = useTranslations("kanban.board.automationSuggestions");
  const locale = useLocale();
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDismissed(loadDismissed(boardId));
  }, [boardId]);

  const allSuggestions = useMemo(
    () => detectAutomationPatterns(cards, buckets),
    [cards, buckets],
  );

  const suggestions = useMemo(
    () => allSuggestions.filter((s) => !dismissed.has(s.id)),
    [allSuggestions, dismissed],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(id);
        persistDismissed(boardId, next);
        return next;
      });
    },
    [boardId],
  );

  const handleApply = useCallback(
    (_suggestion: AutomationSuggestion) => {
      router.push(`/${locale}/board/${boardId}?automations=1`);
    },
    [router, locale, boardId],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="flex items-start gap-2 py-1">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-06)] px-2.5 py-1 text-[10px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-12)] hover:border-[var(--flux-primary-alpha-45)] transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 3v1m0 16v1m8.66-13.5l-.87.5M4.21 16.5l-.87.5M20.66 16.5l-.87-.5M4.21 7.5l-.87-.5M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          {t("badge", { count: suggestions.length })}
        </button>
      ) : (
        <div className="flex flex-col gap-2 w-full animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--flux-text)]">
              {t("title")}
            </span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-md p-0.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
              aria-label="Collapse"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          </div>

          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onApply={handleApply}
              onDismiss={handleDismiss}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
  t,
}: {
  suggestion: AutomationSuggestion;
  onApply: (s: AutomationSuggestion) => void;
  onDismiss: (id: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const pct = Math.round(suggestion.confidence * 100);

  return (
    <div className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-2.5 text-[11px]">
      <p className="font-medium text-[var(--flux-text)] leading-snug mb-1.5">
        {suggestion.description}
      </p>
      <p className="text-[10px] text-[var(--flux-text-muted)] mb-2">
        {suggestion.pattern}
      </p>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-[var(--flux-text-muted)] shrink-0">
          {t("confidence")}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor:
                pct >= 80
                  ? "var(--flux-success, #22c55e)"
                  : pct >= 60
                    ? "var(--flux-primary)"
                    : "var(--flux-warning, #f59e0b)",
            }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-[var(--flux-text-muted)] shrink-0">
          {pct}%
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onApply(suggestion)}
          className="rounded-md border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-16)] transition-colors"
        >
          {t("apply")}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          className="rounded-md border border-[var(--flux-chrome-alpha-12)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
