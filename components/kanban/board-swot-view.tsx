"use client";

import { useMemo, useState } from "react";
import type { CardData } from "@/app/board/[id]/page";
import type { SwotQuadrantKey, SwotTowsStrategy } from "@/lib/template-types";
import { generateTowsStrategies, getSwotQualityInsights, inferSwotQuadrant } from "@/lib/swot-intelligence";

const QUADRANTS: Array<{ key: SwotQuadrantKey; title: string; hint: string; tone: string }> = [
  { key: "strengths", title: "Strengths", hint: "Internal advantages and capabilities", tone: "border-[var(--flux-success)]/45" },
  { key: "weaknesses", title: "Weaknesses", hint: "Internal constraints to improve", tone: "border-[var(--flux-warning)]/45" },
  { key: "opportunities", title: "Opportunities", hint: "External openings to capture", tone: "border-[var(--flux-secondary)]/45" },
  { key: "threats", title: "Threats", hint: "External risks to mitigate", tone: "border-[var(--flux-danger)]/45" },
];

function score(strategy: SwotTowsStrategy): number {
  return (strategy.impact ?? 0) * 2 + (strategy.confidence ?? 0) - (strategy.effort ?? 0) - (strategy.risk ?? 0);
}

type Props = {
  cards: CardData[];
  filterCard: (card: CardData) => boolean;
  onOpenCard: (card: CardData) => void;
  onCreateInitiative: (strategy: SwotTowsStrategy) => void;
};

export function BoardSwotView({ cards, filterCard, onOpenCard, onCreateInitiative }: Props) {
  const [strategies, setStrategies] = useState<SwotTowsStrategy[]>(() => generateTowsStrategies(cards));
  const visibleCards = useMemo(() => cards.filter(filterCard), [cards, filterCard]);
  const insights = useMemo(() => getSwotQualityInsights(visibleCards, strategies), [visibleCards, strategies]);

  const cardsByQuadrant = useMemo(() => {
    const grouped: Record<SwotQuadrantKey, CardData[]> = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    };
    for (const card of visibleCards) {
      const q = inferSwotQuadrant(card);
      if (q) grouped[q].push(card);
    }
    return grouped;
  }, [visibleCards]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--flux-text)]">SWOT/TOWS workspace</h2>
            <p className="text-xs text-[var(--flux-text-muted)]">Diagnose the board, generate TOWS strategies, then convert approved ideas into initiatives.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setStrategies(generateTowsStrategies(visibleCards))}>
            Generate TOWS strategies
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANTS.map((q) => {
            const items = cardsByQuadrant[q.key];
            return (
              <section key={q.key} className={`rounded-[var(--flux-rad-lg)] border ${q.tone} bg-[var(--flux-surface-elevated)]/60 p-3 min-h-[220px]`}>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-[var(--flux-text)]">{q.title}</h3>
                  <p className="text-[11px] text-[var(--flux-text-muted)]">{q.hint}</p>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-[var(--flux-text-muted)]">No SWOT cards here yet.</p>
                  ) : (
                    items.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] px-3 py-2 text-left hover:border-[var(--flux-primary-alpha-35)]"
                        onClick={() => onOpenCard(card)}
                      >
                        <div className="text-sm font-medium text-[var(--flux-text)] line-clamp-2">{card.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(card.tags ?? []).slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-[var(--flux-chrome-alpha-10)] px-1.5 py-0.5 text-[10px] text-[var(--flux-text-muted)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
          <h3 className="font-display font-semibold text-[var(--flux-text)] mb-3">TOWS strategies</h3>
          <div className="space-y-2">
            {strategies.length === 0 ? (
              <p className="text-xs text-[var(--flux-text-muted)]">Add internal and external SWOT cards, then generate strategies.</p>
            ) : (
              strategies.map((strategy) => (
                <article key={strategy.id} className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold rounded-full bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary)] px-2 py-0.5">{strategy.kind}</span>
                      <h4 className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{strategy.title}</h4>
                    </div>
                    <span className="text-[11px] text-[var(--flux-text-muted)]">Score {score(strategy)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--flux-text-muted)]">{strategy.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-[var(--flux-text-muted)]">Impact {strategy.impact ?? "-"}</span>
                    <span className="text-[10px] text-[var(--flux-text-muted)]">Confidence {strategy.confidence ?? "-"}</span>
                    <span className="text-[10px] text-[var(--flux-text-muted)]">Effort {strategy.effort ?? "-"}</span>
                    <span className="text-[10px] text-[var(--flux-text-muted)]">Risk {strategy.risk ?? "-"}</span>
                    <button type="button" className="btn-secondary ml-auto" onClick={() => onCreateInitiative(strategy)}>
                      Convert to initiative
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
          <h3 className="font-display font-semibold text-[var(--flux-text)] mb-3">Quality insights</h3>
          <div className="space-y-2">
            {insights.length === 0 ? (
              <p className="text-xs text-[var(--flux-text-muted)]">No quality gaps detected in the current filter.</p>
            ) : (
              insights.map((insight) => (
                <div key={insight.id} className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/50 p-3">
                  <div className="text-xs font-semibold text-[var(--flux-text)]">{insight.title}</div>
                  <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{insight.description}</p>
                  <p className="mt-2 text-[10px] text-[var(--flux-text-muted)]">{insight.cardIds.length} related card(s)</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
