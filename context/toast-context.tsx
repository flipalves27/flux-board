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
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current.clear();
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
        className="fixed right-4 bottom-4 z-[var(--flux-z-command-backdrop)] flex w-[min(420px,92vw)] flex-col gap-2 pointer-events-none"
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
              className="pointer-events-auto border rounded-[var(--flux-rad)] px-4 py-3 bg-[var(--flux-surface-card)]/95 backdrop-blur-sm shadow-[var(--flux-shadow-toast)]"
              style={{
                borderColor: st.border,
                background: `linear-gradient(180deg, ${st.bg}, var(--flux-surface-card-deep-85))`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-semibold font-display" style={{ color: st.text }}>
                    {kindLabel}
                  </p>
                  <p className="text-sm font-semibold text-[var(--flux-text)] mt-1">{toast.title}</p>
                  {toast.description && (
                    <p className="text-xs text-[var(--flux-text-muted)] mt-1">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="w-8 h-8 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[var(--flux-chrome-alpha-08)] hover:text-[var(--flux-text)] transition-all duration-200"
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

