"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/context/toast-context";
import { useOnda4Flags } from "@/components/fluxy/use-onda4-flags";

type Props = {
  boardId: string;
};

/**
 * Empilha avisos de anomalia via toast context (Onda 4).
 * `?debugAnomaly=1` dispara exemplo para E2E.
 */
export function AnomalyToastStack({ boardId }: Props) {
  const { pushToast } = useToast();
  const onda4 = useOnda4Flags();
  const searchParams = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (!onda4.enabled || !onda4.anomalyToasts) return;
    if (searchParams.get("debugAnomaly") !== "1" || fired.current) return;
    fired.current = true;
    pushToast({
      kind: "warning",
      title: "Possível anomalia de fluxo",
      description: `Board ${boardId}: WIP acima do limite esperado (simulação). Revise os chips de inteligência.`,
    });
  }, [boardId, onda4.enabled, onda4.anomalyToasts, pushToast, searchParams]);

  return null;
}
