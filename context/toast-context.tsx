"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type ToastKind = "success" | "error" | "info" | "warning";

export type ToastInput = {
  title: string;
  description?: string;
  kind?: ToastKind;
  durationMs?: number;
};

export type Toast = {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
  createdAt: number;
  durationMs: number;
};

type ToastContextType = {
  toasts: Toast[];
  pushToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function kindStyles(kind: ToastKind) {
  switch (kind) {
    case "success":
      return {
        border: "var(--flux-success-alpha-35)",
        text: "var(--flux-success)",
        bg: "var(--flux-success-alpha-08)",
      };
    case "error":
      return {
        border: "var(--flux-danger-alpha-38)",
        text: "var(--flux-danger)",
        bg: "var(--flux-danger-alpha-10)",
      };
    case "warning":
      return {
        border: "var(--flux-warning-alpha-38)",
        text: "var(--flux-warning)",
        bg: "var(--flux-warning-alpha-10)",
      };
    case "info":
    default:
      return {
        border: "var(--flux-info-alpha-38)",
        text: "var(--flux-info)",
        bg: "var(--flux-info-alpha-10)",
      };
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const toastsT = useTranslations("toasts");

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = makeId();
      const durationMs = typeof input.durationMs === "number" ? input.durationMs : 4500;
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        kind: input.kind ?? "info",
        createdAt: Date.now(),
        durationMs,
      };

      setToasts((prev) => [toast, ...prev].slice(0, 4));

      if (durationMs > 0) {
        const timerId = window.setTimeout(() => dismissToast(id), durationMs);
        timersRef.current.set(id, timerId);
      }
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- no unmount precisamos do Map atual, não snapshot do mount
      const timers = timersRef.current;
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextType>(
    () => ({
      toasts,
      pushToast,
      dismissToast,
    }),
    [toasts, pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed right-4 bottom-4 z-[var(--flux-z-command-backdrop)] flex w-[min(420px,92vw)] flex-col gap-2.5 pointer-events-none"
      >
        {toasts.map((toast) => {
          const st = kindStyles(toast.kind);
          const kindLabel =
            toast.kind === "success"
              ? toastsT("kinds.success")
              : toast.kind === "error"
                ? toastsT("kinds.error")
                : toast.kind === "warning"
                  ? toastsT("kinds.warning")
                  : toastsT("kinds.info");
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flux-glass-elevated flux-motion-standard rounded-[var(--flux-rad-lg)] px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 shadow-[var(--flux-shadow-toast-strong)]"
              style={{
                borderColor: st.border,
                backgroundImage: `linear-gradient(180deg, ${st.bg}, transparent), var(--flux-glass-elevated-bg)`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] font-semibold font-display" style={{ color: st.text }}>
                    {kindLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{toast.title}</p>
                  {toast.description && (
                    <p className="text-xs text-[var(--flux-text-muted)] mt-1">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="flux-glass-focus flux-motion-standard flex h-8 w-8 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-08)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-12)] hover:text-[var(--flux-text)]"
                  aria-label={toastsT("closeAria")}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

