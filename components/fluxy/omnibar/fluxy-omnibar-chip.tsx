"use client";

import type { FluxyIntentKind } from "@/lib/fluxy-intent-types";

const LABELS: Record<FluxyIntentKind, string> = {
  nav_boards: "Navegação",
  nav_portfolio: "Navegação",
  nav_routines: "Navegação",
  nav_equipe: "Navegação",
  open_command_palette: "Paleta",
  board_copilot: "Copiloto",
  board_nlq: "NLQ",
  board_new_card: "Card",
  unknown: "Geral",
};

export function FluxyOmnibarChip({ intent }: { intent: FluxyIntentKind }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--flux-border-muted)] bg-[var(--flux-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">
      {LABELS[intent] ?? "Fluxy"}
    </span>
  );
}
