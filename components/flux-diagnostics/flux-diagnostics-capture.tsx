"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { exposeFluxDiagnosticsOnWindow, useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";
import { readFluxDiagEnabled } from "@/lib/flux-diagnostics-shared";

/**
 * Fica montado fora do Error Boundary para continuar registrando erros globais após crash de render.
 * Com fluxDebug: também espelha console.error no buffer (útil para mensagens do React em dev).
 */
export function FluxDiagnosticsCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const origConsoleErrorRef = useRef<typeof console.error | null>(null);

  useEffect(() => {
    exposeFluxDiagnosticsOnWindow();
  }, []);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error;
      useFluxDiagnosticsStore.getState().push({
        kind: "window",
        message: e.message || "window error",
        stack: err instanceof Error ? err.stack : undefined,
        extra: [e.filename, e.lineno, e.colno].filter(Boolean).join(":") || undefined,
        severity: "error",
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      useFluxDiagnosticsStore.getState().push({
        kind: "unhandledrejection",
        message: r instanceof Error ? r.message : String(r),
        stack: r instanceof Error ? r.stack : undefined,
        severity: "error",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    const enabled = readFluxDiagEnabled();

    if (!enabled) {
      if (origConsoleErrorRef.current) {
        console.error = origConsoleErrorRef.current;
        origConsoleErrorRef.current = null;
      }
      return;
    }

    if (!origConsoleErrorRef.current) {
      origConsoleErrorRef.current = console.error.bind(console);
    }

    const orig = origConsoleErrorRef.current;
    console.error = (...args: unknown[]) => {
      try {
        const text = args
          .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message + "\n" + a.stack : JSON.stringify(a)))
          .join(" ");
        if (text.length > 8000) {
          useFluxDiagnosticsStore.getState().push({
            kind: "console",
            message: text.slice(0, 8000) + "…(truncado)",
          });
        } else {
          useFluxDiagnosticsStore.getState().push({
            kind: "console",
            message: text,
          });
        }
      } catch {
        /* ignore */
      }
      orig(...args);
    };

    return () => {
      if (origConsoleErrorRef.current) {
        console.error = origConsoleErrorRef.current;
      }
    };
  }, [pathname, queryKey]);

  return null;
}
