"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";
import { FLUX_DIAG_STORAGE_KEY, readFluxDiagEnabled } from "@/lib/flux-diagnostics-shared";

/**
 * Painel flutuante quando fluxDiag está ativo (?fluxDebug=1 ou localStorage fluxDiag=1).
 */
export function FluxDiagnosticsPanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entries = useFluxDiagnosticsStore((s) => s.entries);
  const clear = useFluxDiagnosticsStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const sync = useCallback(() => {
    setEnabled(readFluxDiagEnabled());
  }, []);

  useEffect(() => {
    sync();
  }, [pathname, searchParams, sync]);

  const copyAll = async () => {
    const text = JSON.stringify(
      {
        href: typeof window !== "undefined" ? window.location.href : "",
        entries,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col items-start gap-2 font-sans text-left">
      {!open ? (
        <button
          type="button"
          aria-label="Abrir diagnóstico Flux"
          onClick={() => setOpen(true)}
          className="rounded-full bg-amber-600/90 text-white text-xs font-semibold px-3 py-2 shadow-lg hover:bg-amber-500"
        >
          Diagnóstico ({entries.length})
        </button>
      ) : (
        <div className="w-[min(100vw-2rem,420px)] max-h-[min(70vh,520px)] flex flex-col rounded-xl border border-amber-500/40 bg-[var(--flux-surface)] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--flux-border)] bg-amber-950/40">
            <span className="text-xs font-semibold text-amber-200">Flux diagnóstico</span>
            <div className="flex gap-1">
              <button type="button" className="text-[10px] px-2 py-1 rounded bg-black/30 text-amber-100" onClick={copyAll}>
                Copiar
              </button>
              <button type="button" className="text-[10px] px-2 py-1 rounded bg-black/30 text-amber-100" onClick={clear}>
                Limpar
              </button>
              <button type="button" className="text-[10px] px-2 py-1 rounded bg-black/30 text-amber-100" onClick={() => setOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
          <div className="text-[10px] px-3 py-2 text-[var(--flux-text-muted)] border-b border-[var(--flux-border)]">
            DevTools: <code className="text-amber-200/90">window.__FLUX_DIAG__.dump()</code>
            <br />
            Persistir:{" "}
            <code className="text-amber-200/90">localStorage.setItem(&quot;{FLUX_DIAG_STORAGE_KEY}&quot;,&quot;1&quot;)</code>
          </div>
          <ul className="overflow-y-auto flex-1 p-2 space-y-2 text-[11px] text-[var(--flux-text)]">
            {entries.length === 0 ? (
              <li className="text-[var(--flux-text-muted)]">Nenhum evento ainda.</li>
            ) : (
              entries.map((e) => (
                <li key={e.id} className="rounded-lg border border-[var(--flux-border)] p-2 bg-black/20">
                  <div className="flex justify-between gap-2 text-[10px] text-[var(--flux-text-muted)] mb-1">
                    <span className="font-mono text-amber-200/80">{e.kind}</span>
                    <span>{e.at}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{e.message}</div>
                  {e.stack ? (
                    <pre className="mt-1 text-[10px] text-[var(--flux-text-muted)] whitespace-pre-wrap max-h-24 overflow-auto">
                      {e.stack}
                    </pre>
                  ) : null}
                  {e.componentStack ? (
                    <pre className="mt-1 text-[10px] text-cyan-200/70 whitespace-pre-wrap max-h-20 overflow-auto">
                      {e.componentStack}
                    </pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
