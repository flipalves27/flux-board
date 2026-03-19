"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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
        border: "rgba(0,230,118,0.35)",
        text: "var(--flux-success)",
        bg: "rgba(0,230,118,0.08)",
      };
    case "error":
      return {
        border: "rgba(255,107,107,0.38)",
        text: "var(--flux-danger)",
        bg: "rgba(255,107,107,0.10)",
      };
    case "warning":
      return {
        border: "rgba(255,217,61,0.38)",
        text: "var(--flux-warning)",
        bg: "rgba(255,217,61,0.10)",
      };
    case "info":
    default:
      return {
        border: "rgba(116,185,255,0.38)",
        text: "var(--flux-info)",
        bg: "rgba(116,185,255,0.10)",
      };
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

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
        className="fixed right-4 bottom-4 z-[520] flex w-[min(420px,92vw)] flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const st = kindStyles(t.kind);
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto border rounded-[var(--flux-rad)] px-4 py-3 bg-[var(--flux-surface-card)]/95 backdrop-blur-sm shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              style={{
                borderColor: st.border,
                background: `linear-gradient(180deg, ${st.bg}, rgba(34,31,58,0.85))`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-semibold font-display" style={{ color: st.text }}>
                    {t.kind === "success" ? "OK" : t.kind === "error" ? "Erro" : t.kind === "warning" ? "Atenção" : "Info"}
                  </p>
                  <p className="text-sm font-semibold text-[var(--flux-text)] mt-1">{t.title}</p>
                  {t.description && <p className="text-xs text-[var(--flux-text-muted)] mt-1">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="w-8 h-8 rounded-full border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] transition-all duration-200"
                  aria-label="Fechar notificação"
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

