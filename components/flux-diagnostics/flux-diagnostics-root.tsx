"use client";

import type { ReactNode } from "react";
import { FluxDiagnosticsCapture } from "./flux-diagnostics-capture";
import { FluxDiagnosticsPanel } from "./flux-diagnostics-panel";
import { FluxCrashScreen } from "./flux-crash-screen";
import { FluxErrorBoundary } from "./flux-error-boundary";

/**
 * Envolve a árvore da aplicação: captura global fora do boundary + painel opcional + fallback em erro de render.
 */
export function FluxDiagnosticsRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <FluxDiagnosticsCapture />
      <FluxErrorBoundary fallback={<FluxCrashScreen />}>
        {children}
        <FluxDiagnosticsPanel />
      </FluxErrorBoundary>
    </>
  );
}
