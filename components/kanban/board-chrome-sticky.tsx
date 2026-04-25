"use client";

import type { ReactNode } from "react";
import { Maximize2, SlidersHorizontal } from "lucide-react";
import { boardChromeStickyRootClass, type BoardChromeSurfaceVariant } from "./board-chrome-surface";
import { BoardChromeL1, type BoardChromeL1Props } from "./board-chrome-l1";
import { BoardChromeL3, type BoardChromeL3Props } from "./board-chrome-l3";
import { BoardChromeLayerCollapsible } from "./board-chrome-layer-collapsible";
import { useBoardChromeResponsive } from "./hooks/use-board-chrome-responsive";

export type BoardChromeStickyProps = {
  surfaceVariant?: BoardChromeSurfaceVariant;
  l1: BoardChromeL1Props;
  l3: BoardChromeL3Props;
  /** Resumo quando L3 está fechado (ex.: WIP). */
  l3TriggerSummary?: ReactNode;
  tChrome: (key: string) => string;
  /** Faixa opcional colada ao chrome sticky (ex.: contexto da sprint ativa). */
  chromeFooter?: ReactNode;
};

export function BoardChromeSticky({
  surfaceVariant = "glass",
  l1,
  l3,
  l3TriggerSummary,
  tChrome,
  chromeFooter,
}: BoardChromeStickyProps) {
  const { l3Open, setL3Open } = useBoardChromeResponsive();

  return (
    <div className={boardChromeStickyRootClass(surfaceVariant)}>
      <BoardChromeL1 {...l1} />

      {l1.nlqExpanded && !l1.onda4Omnibar ? (
        <div className="flex justify-end gap-1.5 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-06)] px-3 py-1 sm:px-4">
          {l1.onEnterFocusMode ? (
            <button
              type="button"
              onClick={l1.onEnterFocusMode}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-elevated)] p-1.5 text-[var(--flux-text-muted)] shadow-sm transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)]"
              aria-label={tChrome("chrome.focusMode")}
              title={tChrome("chrome.focusModeTitle")}
            >
              <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setL3Open(!l3Open)}
            aria-expanded={l3Open}
            aria-label={l3Open ? tChrome("chrome.l3Trigger") : tChrome("chrome.l3Trigger")}
            title={tChrome("chrome.l3Trigger")}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-elevated)] p-1.5 text-[var(--flux-text-muted)] shadow-sm transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)]"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}

      <BoardChromeLayerCollapsible
        id="flux-board-chrome-l3"
        open={l3Open}
        onOpenChange={setL3Open}
        triggerLabel={tChrome("chrome.l3Trigger")}
        triggerSummary={l3TriggerSummary}
      >
        <BoardChromeL3 {...l3} />
      </BoardChromeLayerCollapsible>

      {chromeFooter}
    </div>
  );
}
