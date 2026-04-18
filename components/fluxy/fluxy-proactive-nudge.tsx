"use client";

import { useEffect, useRef, useState } from "react";
import { useBoardStore } from "@/stores/board-store";
import { pickProactiveNudge, type FluxyNudge } from "@/lib/fluxy-proactive-rules";
import { useOnda4Flags } from "./use-onda4-flags";

const STORAGE_KEY = "fluxy-proactive-last-nudge-at";

export function FluxyProactiveNudge() {
  const onda4 = useOnda4Flags();
  const cards = useBoardStore((s) => s.db?.cards);
  const [nudge, setNudge] = useState<FluxyNudge | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!onda4.enabled || !onda4.omnibar || shown.current) return;
    const wip = (cards ?? []).filter((c) => c.progress && c.progress !== "Concluída").length;
    let last = 0;
    try {
      last = Number(localStorage.getItem(STORAGE_KEY) || "0") || 0;
    } catch {
      /* ignore */
    }
    const n = pickProactiveNudge({ wipCount: wip, lastNudgeAt: last });
    if (n) {
      shown.current = true;
      setNudge(n);
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }
  }, [cards, onda4.enabled, onda4.omnibar]);

  if (!onda4.enabled || !nudge) return null;

  return (
    <div className="pointer-events-auto fixed bottom-[max(6.5rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[var(--flux-z-command-content)] hidden max-w-[min(320px,88vw)] rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] p-3 text-xs shadow-[var(--flux-shadow-lg)] md:block">
      <p className="font-semibold text-[var(--flux-text)]">{nudge.title}</p>
      <p className="mt-1 text-[var(--flux-text-muted)] leading-relaxed">{nudge.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="text-[var(--flux-primary-light)] hover:underline"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("flux-open-fluxy-omnibar", { detail: { seed: nudge?.title ?? "Ajuda Fluxy" } })
            );
            setNudge(null);
          }}
        >
          Abrir Omnibar
        </button>
        <button type="button" className="text-[var(--flux-text-muted)] hover:underline" onClick={() => setNudge(null)}>
          Dispensar
        </button>
      </div>
    </div>
  );
}
