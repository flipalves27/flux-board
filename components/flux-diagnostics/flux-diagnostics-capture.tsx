"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { exposeFluxDiagnosticsOnWindow, useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";
import {
  clearFluxDiagStorage,
  readFluxDiagEnabledFromStorage,
  syncFluxDebugQueryParam,
} from "@/lib/flux-diagnostics-shared";
import { isPlatformAdminSession } from "@/lib/rbac";

/**
 * Fica montado fora do Error Boundary para continuar registrando erros globais após crash de render.
 * Com fluxDebug: também espelha console.error no buffer (útil para mensagens do React em dev).
 * Painel e persistência `?fluxDebug=1` apenas para platform_admin.
 */
export function FluxDiagnosticsCapture() {
  const { user, isChecked } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const origConsoleErrorRef = useRef<typeof console.error | null>(null);
  const lastUserInteractionAtRef = useRef<number>(Date.now());
  const prevRouteRef = useRef<string | null>(null);
  const prevBoardIdRef = useRef<string | null>(null);

  useEffect(() => {
    exposeFluxDiagnosticsOnWindow();
  }, []);

  useEffect(() => {
    if (!isChecked) return;
    const platformAdmin = Boolean(user && isPlatformAdminSession(user));
    if (!user || !platformAdmin) {
      clearFluxDiagStorage();
      syncFluxDebugQueryParam(false);
      return;
    }
    syncFluxDebugQueryParam(true);
  }, [isChecked, user, pathname, searchParams]);

  useEffect(() => {
    const touch = () => {
      lastUserInteractionAtRef.current = Date.now();
    };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    window.addEventListener("touchstart", touch, { passive: true });
    window.addEventListener("wheel", touch, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("touchstart", touch);
      window.removeEventListener("wheel", touch);
    };
  }, []);

  useEffect(() => {
    const route = queryKey ? `${pathname}?${queryKey}` : pathname;
    const boardMatch = pathname.match(/\/board\/([^/?#]+)/);
    const boardId = boardMatch?.[1] ?? null;
    const prevRoute = prevRouteRef.current;
    const prevBoardId = prevBoardIdRef.current;
    const now = Date.now();
    const idleMs = Math.max(0, now - lastUserInteractionAtRef.current);
    const switchedBoard = Boolean(prevBoardId && boardId && prevBoardId !== boardId);

    if (prevRoute && prevRoute !== route) {
      useFluxDiagnosticsStore.getState().push({
        kind: "navigation",
        message: switchedBoard && idleMs >= 120_000
          ? "Board switch after inactivity"
          : "Route changed",
        severity: switchedBoard && idleMs >= 120_000 ? "warn" : "info",
        route,
        extra: JSON.stringify({
          from: prevRoute,
          to: route,
          fromBoardId: prevBoardId,
          toBoardId: boardId,
          switchedBoard,
          idleMs,
        }),
        hints:
          switchedBoard && idleMs >= 120_000
            ? [
                "Board trocado apos periodo sem interacao do usuario.",
                "Investigue deep-links, redirects e eventos externos que possam alterar a rota.",
              ]
            : undefined,
      });
    }

    prevRouteRef.current = route;
    prevBoardIdRef.current = boardId;
  }, [pathname, queryKey]);

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
    const platformAdmin = Boolean(isChecked && user && isPlatformAdminSession(user));
    const enabled = platformAdmin && readFluxDiagEnabledFromStorage();

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
  }, [pathname, queryKey, isChecked, user]);

  return null;
}
