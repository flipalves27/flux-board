"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { boardChromeStickyRootClass, type BoardChromeSurfaceVariant } from "./board-chrome-surface";
import { BoardChromeL1, type BoardChromeL1Props } from "./board-chrome-l1";
import { BoardChromeL2, type BoardChromeL2Props } from "./board-chrome-l2";
import { BoardChromeL3, type BoardChromeL3Props } from "./board-chrome-l3";
import { BoardChromeLayerCollapsible } from "./board-chrome-layer-collapsible";
import { useBoardChromeResponsive } from "./hooks/use-board-chrome-responsive";

export type BoardChromeStickyProps = {
  surfaceVariant?: BoardChromeSurfaceVariant;
  l1: BoardChromeL1Props;
  l2: BoardChromeL2Props;
  l3: BoardChromeL3Props;
  /** Resumo quando L2 está fechado (ex.: pesquisa ativa). */
  l2TriggerSummary?: ReactNode;
  /** Resumo quando L3 está fechado (ex.: WIP). */
  l3TriggerSummary?: ReactNode;
  tChrome: (key: string) => string;
};

export function BoardChromeSticky({
  surfaceVariant = "glass",
  l1,
  l2,
  l3,
  l2TriggerSummary,
  l3TriggerSummary,
  tChrome,
}: BoardChromeStickyProps) {
  const { l2Open, l3Open, setL2Open, setL3Open } = useBoardChromeResponsive();

  const filterRailOpen = l2Open || l3Open;
  const toggleFilterRail = () => {
    if (filterRailOpen) {
      setL2Open(false);
      setL3Open(false);
    } else {
      setL2Open(true);
      setL3Open(true);
    }
  };

  const railShortcut = {
    expanded: filterRailOpen,
    onToggle: toggleFilterRail,
    expandLabel: tChrome("chrome.filtersRailExpand"),
    collapseLabel: tChrome("chrome.filtersRailCollapse"),
  };

  const l1WithShortcut: BoardChromeL1Props = { ...l1, filterRailShortcut: railShortcut };

  return (
    <div className={boardChromeStickyRootClass(surfaceVariant)}>
      <BoardChromeL1 {...l1WithShortcut} />

      {l1.nlqExpanded && !l1.onda4Omnibar ? (
        <div className="flex justify-end border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-06)] px-3 py-1 sm:px-4">
          <button
            type="button"
            onClick={railShortcut.onToggle}
            aria-expanded={railShortcut.expanded}
            aria-label={railShortcut.expanded ? railShortcut.collapseLabel : railShortcut.expandLabel}
            title={railShortcut.expanded ? railShortcut.collapseLabel : railShortcut.expandLabel}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-surface-elevated)] p-1.5 text-[var(--flux-text-muted)] shadow-sm transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)]"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : null}

      <BoardChromeLayerCollapsible
        id="flux-board-chrome-l2"
        open={l2Open}
        onOpenChange={setL2Open}
        triggerLabel={tChrome("chrome.l2Trigger")}
        triggerSummary={l2TriggerSummary}
      >
        <BoardChromeL2 {...l2} />
      </BoardChromeLayerCollapsible>

      <BoardChromeLayerCollapsible
        id="flux-board-chrome-l3"
        open={l3Open}
        onOpenChange={setL3Open}
        triggerLabel={tChrome("chrome.l3Trigger")}
        triggerSummary={l3TriggerSummary}
      >
        <BoardChromeL3 {...l3} />
      </BoardChromeLayerCollapsible>
    </div>
  );
}
