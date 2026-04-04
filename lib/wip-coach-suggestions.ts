import { computeWorkloadEntries, type WorkloadEntry } from "@/lib/ai-workload-balancer";
import { generateProactiveNudges, type ProactiveNudge } from "@/lib/copilot-proactive-engine";
import type { BoardData } from "@/lib/kv-boards";

export type WipCoachAction = {
  id: string;
  kind: "prioritize_card" | "reduce_wip" | "rebalance_workload" | "unblock";
  title: string;
  detail: string;
  cardId?: string;
  columnKey?: string;
};

type ColumnConfig = { key: string; label: string; wipLimit?: number };

type CardLike = Parameters<typeof generateProactiveNudges>[0][number];

function pickCardToFinishFirstInColumn(cards: CardLike[], columnKey: string, columnLabel: string): CardLike | null {
  const inCol = cards.filter((c) => c.progress !== "Concluída" && (c.bucket === columnKey || c.bucket === columnLabel));
  if (!inCol.length) return null;
  const prioOrder: Record<string, number> = { Urgente: 0, Importante: 1, "Média": 2 };
  const rank = (p: string | undefined) =>
    p != null && p in prioOrder ? prioOrder[p]! : 9;
  return [...inCol].sort((a, b) => rank(a.priority) - rank(b.priority))[0] ?? null;
}

function workloadCoachActions(entries: WorkloadEntry[]): WipCoachAction[] {
  if (entries.length < 2) return [];
  const avg = entries.reduce((s, e) => s + e.estimatedLoadScore, 0) / entries.length;
  const overloaded = entries.filter((e) => e.estimatedLoadScore > avg * 1.45);
  const under = entries.filter((e) => e.estimatedLoadScore < avg * 0.55);
  const actions: WipCoachAction[] = [];
  for (const o of overloaded.slice(0, 2)) {
    const target = under[0];
    if (!target) break;
    actions.push({
      id: `wl:${o.memberId}->${target.memberId}`,
      kind: "rebalance_workload",
      title: `Redistribuir carga: ${o.memberName} → ${target.memberName}`,
      detail: `${o.memberName} tem score ${o.estimatedLoadScore} (${o.cardCount} cards ativos); ${target.memberName} está mais disponível (score ${target.estimatedLoadScore}). Considere realocar um card de média prioridade.`,
    });
  }
  return actions;
}

/**
 * Combines heuristic nudges with actionable WIP / workload coaching (no extra LLM call).
 */
export function buildWipCoachPackage(board: BoardData, columns: ColumnConfig[]): {
  nudges: ProactiveNudge[];
  actions: WipCoachAction[];
  workloadEntries: WorkloadEntry[];
} {
  const cards = (Array.isArray(board.cards) ? board.cards : []) as CardLike[];
  const nudges = generateProactiveNudges(cards, columns, { staleDays: 5, maxNudges: 10 });

  const actions: WipCoachAction[] = [];
  const wipNudges = nudges.filter((n) => n.type === "wip_limit_exceeded");
  for (const w of wipNudges) {
    const col = columns.find((c) => c.key === w.column || c.label === w.column);
    const key = col?.key ?? w.column ?? "";
    const label = col?.label ?? key;
    const pick = pickCardToFinishFirstInColumn(cards, key, label);
    if (pick) {
      actions.push({
        id: `wip-prio:${key}:${pick.id}`,
        kind: "prioritize_card",
        title: `Concluir ou mover: "${pick.title.slice(0, 48)}${pick.title.length > 48 ? "…" : ""}"`,
        detail: `Coluna "${label}" está acima do WIP. Priorize entregar este card ou devolver ao backlog para restaurar o fluxo.`,
        cardId: pick.id,
        columnKey: key,
      });
    } else {
      actions.push({
        id: `wip-col:${key}`,
        kind: "reduce_wip",
        title: `Reduzir WIP em "${label}"`,
        detail: "Nenhum card óbvio para priorizar — revise política da coluna ou mova itens para uma coluna anterior.",
        columnKey: key,
      });
    }
  }

  const entries = computeWorkloadEntries(board);
  actions.push(...workloadCoachActions(entries));

  const blocked = nudges.filter((n) => n.type === "blocked_chain").slice(0, 2);
  for (const b of blocked) {
    if (b.cardId) {
      actions.push({
        id: `unblock:${b.cardId}`,
        kind: "unblock",
        title: "Desbloquear dependência",
        detail: b.message,
        cardId: b.cardId,
      });
    }
  }

  return { nudges, actions: actions.slice(0, 12), workloadEntries: entries };
}
