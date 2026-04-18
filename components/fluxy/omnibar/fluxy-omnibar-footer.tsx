"use client";

import type { FluxyClassifyMeta } from "@/lib/fluxy-intent-types";

function costLabel(h: FluxyClassifyMeta["costHint"]): string {
  switch (h) {
    case "none":
      return "Custo: local / cache";
    case "low":
      return "Custo: baixo (modelo compacto)";
    case "medium":
      return "Custo: médio";
    case "high":
      return "Custo: alto";
    default:
      return "";
  }
}

export function FluxyOmnibarFooter(props: { meta: FluxyClassifyMeta | null; keyboardHints: boolean }) {
  const { meta, keyboardHints } = props;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--flux-border-muted)] pt-2 text-[10px] text-[var(--flux-text-muted)]">
      <span>{meta ? costLabel(meta.costHint) : "Custo: —"}</span>
      {keyboardHints ? (
        <span className="hidden md:inline">
          <kbd className="rounded bg-[var(--flux-surface-elevated)] px-1">↑↓</kbd> mover ·{" "}
          <kbd className="rounded bg-[var(--flux-surface-elevated)] px-1">Enter</kbd> executar ·{" "}
          <kbd className="rounded bg-[var(--flux-surface-elevated)] px-1">Esc</kbd> fechar
        </span>
      ) : null}
    </div>
  );
}
