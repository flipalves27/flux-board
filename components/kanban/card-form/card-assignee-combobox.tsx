"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { inputBase } from "@/components/kanban/card-modal-section";

export type CardAssigneeOption = {
  userId: string;
  label: string;
};

type Labels = {
  unassigned: string;
  selectedTag: string;
  selectedLabel: string;
  clear: string;
  placeholder: string;
  meShortcut: string;
  loading: string;
  emptyFilter: string;
  hint: string;
};

type Props = {
  value: string;
  onChange: (userId: string) => void;
  options: CardAssigneeOption[];
  loading: boolean;
  currentUserId?: string;
  labels: Labels;
  inputClassName?: string;
};

export function CardAssigneeCombobox({
  value,
  onChange,
  options,
  loading,
  currentUserId,
  labels,
  inputClassName,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(() => options.find((o) => o.userId === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const label = opt.label.toLowerCase();
      const uid = opt.userId.toLowerCase();
      return label.includes(q) || uid.includes(q);
    });
  }, [options, query]);

  /** Row 0 = sem responsável; depois filtered */
  const rowCount = 1 + filtered.length;

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, rowCount - 1)));
  }, [rowCount]);

  const syncInputFromValue = useCallback(() => {
    if (!value) {
      setQuery("");
      return;
    }
    if (selected) setQuery(selected.label);
    else setQuery(value);
  }, [value, selected]);

  useEffect(() => {
    if (!open) syncInputFromValue();
  }, [open, syncInputFromValue]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setQuery("");
    setHighlight(0);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    syncInputFromValue();
    setHighlight(0);
  }, [syncInputFromValue]);

  const selectNone = useCallback(() => {
    onChange("");
    closePanel();
  }, [onChange, closePanel]);

  const selectUser = useCallback(
    (userId: string) => {
      onChange(userId);
      closePanel();
    },
    [onChange, closePanel]
  );

  const applyHighlight = (idx: number) => {
    if (idx < 0) setHighlight(rowCount - 1);
    else if (idx >= rowCount) setHighlight(0);
    else setHighlight(idx);
  };

  const commitHighlight = () => {
    if (highlight === 0) selectNone();
    else {
      const opt = filtered[highlight - 1];
      if (opt) selectUser(opt.userId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        applyHighlight(highlight + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        applyHighlight(highlight - 1);
        break;
      case "Enter":
        e.preventDefault();
        commitHighlight();
        break;
      case "Escape":
        e.preventDefault();
        closePanel();
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) closePanel();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, closePanel]);

  const optionBase =
    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--flux-primary-alpha-45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--flux-surface-card)]";
  const activeRow =
    "border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-14)] text-[var(--flux-primary-light)] shadow-[inset_0_0_0_1px_var(--flux-primary-alpha-18)]";
  const inactiveRow = "border border-transparent text-[var(--flux-text)] hover:bg-[var(--flux-primary-alpha-08)]";
  const inactiveNone = "border border-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]";

  const quickBase =
    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--flux-primary-alpha-45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--flux-surface-card)]";

  return (
    <div ref={wrapRef} className="space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : selected ? selected.label : value ? value : ""}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (!open) setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            openPanel();
          }}
          onKeyDown={onKeyDown}
          placeholder={labels.placeholder}
          className={
            inputClassName ??
            `${inputBase} border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] pr-10 transition-all duration-150 placeholder:text-[var(--flux-text-muted)]/85 focus-visible:border-[var(--flux-primary-alpha-35)] focus-visible:bg-[var(--flux-primary-alpha-08)] focus-visible:ring-2 focus-visible:ring-[var(--flux-primary-alpha-35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--flux-surface-card)]`
          }
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--flux-text-muted)]" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? "rotate-180 transition-transform" : "transition-transform"}>
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {open ? (
          <div
            id={listId}
            role="listbox"
            aria-label={labels.placeholder}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-1 shadow-[0_12px_40px_-8px_var(--flux-black-alpha-50)]"
          >
            <button
              type="button"
              role="option"
              id={`${listId}-opt-0`}
              aria-selected={highlight === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectNone()}
              className={`${optionBase} ${highlight === 0 ? activeRow : !value ? activeRow : inactiveNone}`}
            >
              <span>{labels.unassigned}</span>
              {!value ? <span className="text-[11px] font-semibold">{labels.selectedTag}</span> : null}
            </button>
            {filtered.map((opt, i) => {
              const idx = i + 1;
              const sel = value === opt.userId;
              return (
                <button
                  key={opt.userId}
                  type="button"
                  role="option"
                  id={`${listId}-opt-${idx}`}
                  aria-selected={highlight === idx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectUser(opt.userId)}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`${optionBase} ${highlight === idx ? activeRow : sel ? activeRow : inactiveRow}`}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="ml-2 shrink-0 font-mono text-[11px] text-[var(--flux-text-muted)]">{opt.userId}</span>
                </button>
              );
            })}
            {filtered.length === 0 && !loading ? (
              <p className="px-3 py-2 text-xs text-[var(--flux-text-muted)]">{labels.emptyFilter}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {currentUserId ? (
          <button
            type="button"
            onClick={() => selectUser(currentUserId)}
            className={`${quickBase} ${
              value === currentUserId
                ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-14)] text-[var(--flux-primary-light)] shadow-[inset_0_0_0_1px_var(--flux-primary-alpha-18)]"
                : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
            }`}
          >
            {labels.meShortcut}
          </button>
        ) : null}
        {value ? (
          <button
            type="button"
            onClick={() => selectNone()}
            className={`${quickBase} border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-03)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-30)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]`}
          >
            {labels.clear}
          </button>
        ) : null}
      </div>

      <div className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] px-2.5 py-1.5">
        <p className="text-[11px] leading-relaxed text-[var(--flux-text-muted)]">
          {loading ? (
            labels.loading
          ) : selected ? (
            <>
              <span className="font-semibold text-[var(--flux-text)]">{labels.selectedLabel}</span> {selected.label}
            </>
          ) : (
            labels.hint
          )}
        </p>
      </div>
    </div>
  );
}
