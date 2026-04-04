"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { useFluxDiagnosticsStore } from "@/stores/flux-diagnostics-store";

type Props = {
  children: ReactNode;
  /** Fallback quando há erro (evita tela branca; diagnóstico fica no store). */
  fallback: ReactNode;
};

/**
 * Boundary de erro de classe — captura falhas de render (incl. muitos casos de #185)
 * e grava stack + componentStack no store de diagnóstico.
 */
export class FluxErrorBoundary extends Component<Props, { error: Error | null }> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    useFluxDiagnosticsStore.getState().push({
      kind: "react-boundary",
      message: error.message || String(error),
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      extra: `name=${error.name}`,
      severity: "error",
    });
  }

  render() {
    if (this.state.error) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
