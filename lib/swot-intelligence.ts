import type { CardData } from "@/app/board/[id]/page";
import type { SwotQuadrantKey, SwotTowsStrategy, SwotTowsStrategyKind } from "./template-types";

export type SwotQualityInsight = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  cardIds: string[];
};

type SwotCard = CardData & {
  swotMeta?: {
    quadrant?: SwotQuadrantKey;
    evidence?: string;
    impact?: number;
    confidence?: number;
    effort?: number;
    risk?: number;
    status?: string;
  };
};

const QUADRANTS: SwotQuadrantKey[] = ["strengths", "weaknesses", "opportunities", "threats"];

export function inferSwotQuadrant(card: Pick<CardData, "bucket" | "tags">): SwotQuadrantKey | null {
  if ((QUADRANTS as readonly string[]).includes(card.bucket)) return card.bucket as SwotQuadrantKey;
  const tags = Array.isArray(card.tags) ? card.tags.map((t) => t.toLowerCase()) : [];
  return QUADRANTS.find((q) => tags.includes(q)) ?? null;
}

function score(card: SwotCard, key: "impact" | "confidence" | "effort" | "risk", fallback: number): number {
  const value = card.swotMeta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strategyKind(a: SwotQuadrantKey, b: SwotQuadrantKey): SwotTowsStrategyKind | null {
  const pair = new Set([a, b]);
  if (pair.has("strengths") && pair.has("opportunities")) return "SO";
  if (pair.has("weaknesses") && pair.has("opportunities")) return "WO";
  if (pair.has("strengths") && pair.has("threats")) return "ST";
  if (pair.has("weaknesses") && pair.has("threats")) return "WT";
  return null;
}

function strategyTitle(kind: SwotTowsStrategyKind, internal: SwotCard, external: SwotCard): string {
  const map: Record<SwotTowsStrategyKind, string> = {
    SO: "Use strength to capture opportunity",
    WO: "Close weakness to capture opportunity",
    ST: "Use strength to reduce threat",
    WT: "Reduce weakness exposure to threat",
  };
  return `${map[kind]}: ${internal.title} + ${external.title}`.slice(0, 300);
}

export function generateTowsStrategies(cards: CardData[]): SwotTowsStrategy[] {
  const swotCards = cards
    .map((card) => ({ ...(card as SwotCard), inferredQuadrant: inferSwotQuadrant(card) }))
    .filter((card): card is SwotCard & { inferredQuadrant: SwotQuadrantKey } => Boolean(card.inferredQuadrant));
  const internal = swotCards.filter((card) => card.inferredQuadrant === "strengths" || card.inferredQuadrant === "weaknesses");
  const external = swotCards.filter((card) => card.inferredQuadrant === "opportunities" || card.inferredQuadrant === "threats");

  const strategies: SwotTowsStrategy[] = [];
  for (const i of internal) {
    for (const e of external) {
      const kind = strategyKind(i.inferredQuadrant, e.inferredQuadrant);
      if (!kind) continue;
      const impact = Math.round((score(i, "impact", 3) + score(e, "impact", 3)) / 2);
      const confidence = Math.round((score(i, "confidence", 3) + score(e, "confidence", 3)) / 2);
      const effort = Math.max(1, Math.round((score(i, "effort", 2) + score(e, "effort", 3)) / 2));
      const risk = Math.round((score(i, "risk", i.inferredQuadrant === "weaknesses" ? 3 : 2) + score(e, "risk", e.inferredQuadrant === "threats" ? 4 : 2)) / 2);
      strategies.push({
        id: `tows_${kind}_${i.id}_${e.id}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100),
        kind,
        title: strategyTitle(kind, i, e),
        description: `Review whether "${i.title}" and "${e.title}" should become a focused strategic initiative.`,
        sourceCardIds: [i.id, e.id],
        impact,
        confidence,
        effort,
        risk,
      });
    }
  }

  return strategies
    .sort((a, b) => (b.impact ?? 0) + (b.confidence ?? 0) - (b.effort ?? 0) - ((a.impact ?? 0) + (a.confidence ?? 0) - (a.effort ?? 0)))
    .slice(0, 12);
}

export function getSwotQualityInsights(cards: CardData[], strategies: SwotTowsStrategy[]): SwotQualityInsight[] {
  const swotCards = cards.filter((card) => inferSwotQuadrant(card));
  const withoutEvidence = swotCards.filter((card) => {
    const meta = (card as SwotCard).swotMeta;
    return !meta?.evidence && !card.desc.trim();
  });
  const opportunitiesWithoutAction = swotCards.filter((card) => inferSwotQuadrant(card) === "opportunities" && !strategies.some((s) => s.sourceCardIds.includes(card.id)));
  const criticalWeaknessThreat = swotCards.filter((card) => {
    const q = inferSwotQuadrant(card);
    const risk = score(card as SwotCard, "risk", q === "threats" ? 4 : 2);
    return (q === "weaknesses" || q === "threats") && risk >= 4;
  });
  const quickWins = strategies.filter((s) => (s.impact ?? 0) >= 4 && (s.effort ?? 5) <= 2);

  return [
    withoutEvidence.length
      ? {
          id: "missing_evidence",
          severity: "warning",
          title: "Items without evidence",
          description: "Add a metric, customer quote, competitor signal, or research source before prioritizing.",
          cardIds: withoutEvidence.map((c) => c.id),
        }
      : null,
    opportunitiesWithoutAction.length
      ? {
          id: "opportunities_without_tows",
          severity: "info",
          title: "Opportunities need TOWS links",
          description: "Connect these opportunities to strengths or weaknesses to turn diagnosis into strategy.",
          cardIds: opportunitiesWithoutAction.map((c) => c.id),
        }
      : null,
    criticalWeaknessThreat.length
      ? {
          id: "critical_wt",
          severity: "critical",
          title: "Critical weakness/threat exposure",
          description: "Prioritize WT mitigation before these risks become execution blockers.",
          cardIds: criticalWeaknessThreat.map((c) => c.id),
        }
      : null,
    quickWins.length
      ? {
          id: "quick_wins",
          severity: "info",
          title: "Quick wins available",
          description: "High-impact, low-effort TOWS strategies are ready for initiative conversion.",
          cardIds: quickWins.flatMap((s) => s.sourceCardIds),
        }
      : null,
  ].filter(Boolean) as SwotQualityInsight[];
}

export function strategyToInitiative(strategy: SwotTowsStrategy, existingCards: CardData[]): CardData {
  const maxOrder = existingCards.filter((c) => c.bucket === "action_plan").reduce((acc, c) => Math.max(acc, c.order ?? 0), -1);
  const id = `swot_action_${Date.now()}`;
  return {
    id,
    bucket: "action_plan",
    priority: (strategy.impact ?? 0) >= 4 ? "Alta" : "Média",
    progress: "Não iniciado",
    title: strategy.title,
    desc: `${strategy.description}\n\nOrigin TOWS: ${strategy.kind}\nSource cards: ${strategy.sourceCardIds.join(", ")}`,
    tags: ["SWOT", "TOWS", "Action"],
    direction: "priorizar",
    dueDate: null,
    blockedBy: strategy.sourceCardIds,
    order: maxOrder + 1,
    swotMeta: {
      strategyId: strategy.id,
      strategyKind: strategy.kind,
      status: "converted",
      sourceCardIds: strategy.sourceCardIds,
    },
  } as CardData;
}
