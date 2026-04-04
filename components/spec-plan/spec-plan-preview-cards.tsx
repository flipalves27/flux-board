"use client";

import { useState } from "react";

export type PreviewCardRow = {
  title: string;
  desc: string;
  bucketKey: string;
  priority: string;
  progress: string;
  tags: string[];
  rationale: string;
  blockedByTitles: string[];
  subtasks: { title: string }[];
  storyPoints: number | null;
  serviceClass: string | null;
};

type BucketOpt = { key: string; label: string };

export function SpecPlanPreviewCards(props: {
  preview: PreviewCardRow[];
  buckets: BucketOpt[];
  colBucket: string;
  colPriority: string;
  colTags: string;
  colRationale: string;
  colTitleField: string;
  removeLabel: string;
  onChangeTitle: (index: number, title: string) => void;
  onChangeBucket: (index: number, bucketKey: string) => void;
  onChangePriority: (index: number, priority: string) => void;
  onChangeTags: (index: number, tags: string[]) => void;
  onRemove: (index: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {props.preview.map((row, i) => {
        const isOpen = open === i;
        const bucketLabel =
          props.buckets.find((b) => b.key === row.bucketKey)?.label || row.bucketKey || "—";
        return (
          <div
            key={i}
            className="overflow-hidden rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-12)] bg-[var(--flux-surface-elevated)]"
          >
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--flux-primary-alpha-06)]"
              onClick={() => setOpen((o) => (o === i ? null : i))}
            >
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--flux-primary-alpha-20)] text-xs font-bold text-[var(--flux-primary-light)]`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[var(--flux-text)]">{row.title || "—"}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--flux-text-muted)]">
                  <span>
                    {props.colBucket}: {bucketLabel}
                  </span>
                  <span>
                    {props.colPriority}: {row.priority}
                  </span>
                  {row.tags.length > 0 ? (
                    <span>
                      {props.colTags}: {row.tags.join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="shrink-0 text-[var(--flux-text-muted)]">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-[var(--flux-primary-alpha-08)] bg-[var(--flux-surface-dark)] px-4 py-3">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {props.colTitleField}
                </label>
                <input
                  className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
                  value={row.title}
                  onChange={(e) => props.onChangeTitle(i, e.target.value)}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                      {props.colBucket}
                    </label>
                    <select
                      className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
                      value={
                        props.buckets.some((b) => b.key === row.bucketKey)
                          ? row.bucketKey
                          : props.buckets[0]?.key || ""
                      }
                      onChange={(e) => props.onChangeBucket(i, e.target.value)}
                    >
                      {(props.buckets.length ? props.buckets : [{ key: row.bucketKey, label: row.bucketKey }]).map(
                        (b) => (
                          <option key={b.key} value={b.key}>
                            {b.label || b.key}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                      {props.colPriority}
                    </label>
                    <select
                      className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
                      value={row.priority}
                      onChange={(e) => props.onChangePriority(i, e.target.value)}
                    >
                      <option>Urgente</option>
                      <option>Importante</option>
                      <option>Média</option>
                    </select>
                  </div>
                </div>
                <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {props.colTags}
                </label>
                <input
                  className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
                  value={row.tags.join(", ")}
                  onChange={(e) =>
                    props.onChangeTags(
                      i,
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                />
                {row.desc ? (
                  <p className="mt-3 max-h-32 overflow-y-auto text-xs leading-relaxed text-[var(--flux-text-muted)] scrollbar-flux">
                    {row.desc}
                  </p>
                ) : null}
                {row.rationale ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--flux-primary-light)]">
                      {props.colRationale}
                    </summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--flux-text-muted)]">{row.rationale}</p>
                  </details>
                ) : null}
                <button
                  type="button"
                  className="mt-4 text-xs font-semibold text-[var(--flux-danger)]"
                  onClick={() => props.onRemove(i)}
                >
                  {props.removeLabel}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
