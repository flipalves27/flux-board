import type { BoardData } from "@/lib/kv-boards";
import {
  runMonteCarloSimulation,
  computeCardRiskScore,
  computeThroughputForecast,
  computeScopeCreepRatio,
  deriveSprintHealth,
  type DeliveryForecastResult,
} from "@/lib/predictive-delivery";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DeliveryForecastScenario = {
  /** Remover N itens do escopo restante (simulação de corte). */
  removeItems?: number;
  /** Multiplicador de throughput diário (capacidade / foco). 1 = baseline. */
  capacityMultiplier?: number;
};

export type DeliveryForecastAudit = {
  incompleteCountBaseline: number;
  incompleteCountScenario: number;
  capacityMultiplier: number;
  removeItems: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Previsão de entrega a partir do board; cenário opcional ajusta itens restantes e throughput histórico.
 */
export function computeDeliveryForecastForBoard(
  board: BoardData,
  scenario?: DeliveryForecastScenario
): { result: DeliveryForecastResult; audit: DeliveryForecastAudit } {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const now = Date.now();

  const incompleteCards = cards.filter((raw) => {
    const c = raw as Record<string, unknown>;
    return String(c.progress || "") !== "Concluída";
  });
  const completedCards = cards.filter((raw) => {
    const c = raw as Record<string, unknown>;
    return String(c.progress || "") === "Concluída";
  });

  const removeItems = clamp(Math.floor(scenario?.removeItems ?? 0), 0, 500);
  const capMul = clamp(Number(scenario?.capacityMultiplier ?? 1) || 1, 0.25, 2.5);

  const incompleteCountBaseline = incompleteCards.length;
  const incompleteCountScenario = Math.max(0, incompleteCountBaseline - removeItems);

  const completedByDay = new Map<string, number>();
  for (const card of completedCards) {
    const c = card as Record<string, unknown>;
    const completedAt = c.completedAt ?? c.columnEnteredAt;
    if (typeof completedAt === "string") {
      const dayKey = completedAt.slice(0, 10);
      completedByDay.set(dayKey, (completedByDay.get(dayKey) || 0) + 1);
    }
  }

  const last30Days: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const base = completedByDay.get(key) || 0;
    last30Days.push(Math.round(base * capMul * 1000) / 1000);
  }

  const weeklyThroughput: number[] = [];
  for (let w = 0; w < Math.min(8, Math.floor(last30Days.length / 7)); w++) {
    const weekSlice = last30Days.slice(w * 7, (w + 1) * 7);
    weeklyThroughput.push(weekSlice.reduce((a, b) => a + b, 0));
  }

  const monteCarlo = runMonteCarloSimulation(incompleteCountScenario, last30Days);

  const riskCards = incompleteCards
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      return computeCardRiskScore({
        id: String(c.id || ""),
        title: String(c.title || ""),
        createdAt: typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null,
        lastActivityAt: typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null,
        blockedBy: Array.isArray(c.blockedBy) ? c.blockedBy.filter((x: unknown) => typeof x === "string") : [],
        dependencyCount: Array.isArray(c.blockedBy) ? c.blockedBy.length : 0,
        progress: String(c.progress || ""),
        dueDate: typeof c.dueDate === "string" ? c.dueDate : null,
      });
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const throughputForecast = computeThroughputForecast(weeklyThroughput, 4);

  const scopeCreepRatio = computeScopeCreepRatio(
    incompleteCards.length + completedCards.length,
    0
  );

  const avgRisk = riskCards.length > 0
    ? riskCards.reduce((a, r) => a + r.score, 0) / riskCards.length
    : 0;

  const sprintHealthLabel = deriveSprintHealth(scopeCreepRatio, avgRisk, monteCarlo, 14);

  const result: DeliveryForecastResult = {
    monteCarlo,
    riskCards,
    throughputForecast,
    scopeCreepRatio,
    sprintHealthLabel,
  };

  return {
    result,
    audit: {
      incompleteCountBaseline,
      incompleteCountScenario,
      capacityMultiplier: capMul,
      removeItems,
    },
  };
}
