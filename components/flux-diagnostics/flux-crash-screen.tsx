"use client";

import { useMemo } from "react";
import { useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";

/**
 * Fallback do Error Boundary: copiar buffer de diagnóstico e recarregar (evita tela branca).
 */
export function FluxCrashScreen() {
  const entries = useFluxDiagnosticsStore((s) => s.entries);

  const payload = useMemo(
    () =>
      JSON.stringify(
        {
          ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
          href: typeof window !== "undefined" ? window.location.href : "",
          entries,
        },
        null,
        2
      ),
    [entries]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-[50vh] p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--flux-text)] mb-2">Erro ao renderizar</h1>
      <p className="text-sm text-[var(--flux-text-muted)] mb-4">
        O app encontrou um erro fatal (ex.: React #185 — excesso de atualizações). Copie o diagnóstico abaixo e
        envie à equipe, ou use <code className="text-xs bg-black/20 px-1 rounded">?fluxDebug=1</code> na URL antes
        de reproduzir para capturar mais detalhes.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-medium text-[var(--flux-primary-fg)]"
        >
          Copiar diagnóstico
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-[var(--flux-border)] px-4 py-2 text-sm text-[var(--flux-text)]"
        >
          Recarregar página
        </button>
      </div>
      <pre className="text-xs overflow-auto max-h-[40vh] p-3 rounded-lg bg-black/30 border border-[var(--flux-border)] text-left whitespace-pre-wrap break-words">
        {payload.slice(0, 12000)}
        {payload.length > 12000 ? "\n…(truncado)" : ""}
      </pre>
    </div>
  );
}
