"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string;
  editable: boolean;
  maxLength: number;
  label: string;
  placeholder: string;
  editCta: string;
  saveLabel: string;
  cancelLabel: string;
  savedHint?: string;
  onSave: (next: string) => void;
};

export function ExecutiveProductGoalInline({
  value,
  editable,
  maxLength,
  label,
  placeholder,
  editCta,
  saveLabel,
  cancelLabel,
  savedHint,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const trimmed = draft.trim();
  const showBody = trimmed.length > 0 || editing;

  if (!showBody && !editable) return null;

  return (
    <div className="rounded-2xl border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary)]">{label}</p>
        {editable && !editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
          >
            {editCta}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
            rows={4}
            placeholder={placeholder}
            className="w-full resize-y rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--flux-primary-alpha-35)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
              className="rounded-lg bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-foreground)] hover:opacity-95"
            >
              {saveLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            >
              {cancelLabel}
            </button>
            <span className="text-[10px] text-[var(--flux-text-muted)] tabular-nums ml-auto">
              {draft.length}/{maxLength}
            </span>
          </div>
        </div>
      ) : trimmed ? (
        <p className="text-sm text-[var(--flux-text)] mt-0.5 leading-relaxed whitespace-pre-wrap">{trimmed}</p>
      ) : editable ? (
        <p className="text-xs text-[var(--flux-text-muted)] mt-1">{placeholder}</p>
      ) : null}
      {!editing && trimmed && editable && savedHint ? (
        <p className="text-[9px] text-[var(--flux-text-muted)] mt-2">{savedHint}</p>
      ) : null}
    </div>
  );
}
