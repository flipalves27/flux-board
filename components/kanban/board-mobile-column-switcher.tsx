"use client";

import type { BucketConfig, CardData } from "@/app/board/[id]/page";

type BoardMobileColumnSwitcherProps = {
  buckets: BucketConfig[];
  activeKey: string | null;
  visibleCardsByBucket: (key: string) => CardData[];
  onActiveKeyChange: (key: string) => void;
  onAddCard: (key: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

export function BoardMobileColumnSwitcher({
  buckets,
  activeKey,
  visibleCardsByBucket,
  onActiveKeyChange,
  onAddCard,
  t,
}: BoardMobileColumnSwitcherProps) {
  if (buckets.length === 0) return null;

  const activeBucket = buckets.find((b) => b.key === activeKey) ?? buckets[0];
  const activeCount = visibleCardsByBucket(activeBucket.key).length;

  return (
    <section
      className="md:hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-subtle)] bg-[color-mix(in_srgb,var(--flux-surface-card)_86%,transparent)] p-2.5 shadow-[var(--flux-shadow-kanban-column)] backdrop-blur-[14px]"
      aria-label={t("board.mobileColumnPicker.label")}
    >
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("board.mobileColumnPicker.selectLabel")}</span>
          <select
            value={activeBucket.key}
            onChange={(e) => onActiveKeyChange(e.target.value)}
            className="h-11 w-full min-w-0 rounded-xl border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 text-sm font-semibold text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[var(--flux-primary-alpha-22)]"
          >
            {buckets.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label} ({visibleCardsByBucket(bucket.key).length})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onAddCard(activeBucket.key)}
          className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)] px-3 text-sm font-bold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-18)]"
          aria-label={t("board.mobileColumnPicker.addCard", { column: activeBucket.label })}
        >
          +
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--flux-text-muted)]">
        <span className="min-w-0 truncate">{activeBucket.label}</span>
        <span className="shrink-0 rounded-full bg-[var(--flux-chrome-alpha-12)] px-2 py-0.5 tabular-nums">
          {typeof activeBucket.wipLimit === "number"
            ? `${activeCount}/${activeBucket.wipLimit}`
            : t("board.mobileColumnPicker.cardCount", { count: activeCount })}
        </span>
      </div>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-flux" role="tablist" aria-label={t("board.mobileColumnPicker.pillsLabel")}>
        {buckets.map((bucket) => {
          const selected = bucket.key === activeBucket.key;
          return (
            <button
              key={bucket.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onActiveKeyChange(bucket.key)}
              className={`inline-flex h-9 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                selected
                  ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-08)] text-[var(--flux-text-muted)]"
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: bucket.color || "var(--flux-text-muted)" }}
                aria-hidden
              />
              <span className="min-w-0 truncate">{bucket.label}</span>
              <span className="tabular-nums opacity-80">{visibleCardsByBucket(bucket.key).length}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
