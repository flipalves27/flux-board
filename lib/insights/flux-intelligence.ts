import type { BoardData } from "@/lib/kv-boards";
import type { SprintData } from "@/lib/schemas";

export type FluxInsightSeverity = "info" | "warning" | "critical";

export type FluxInsightType =
  | "sprint_risk"
  | "member_overload"
  | "bug_concentration"
  | "velocity_trend"
  | "blocked_chain"
  | "idle_assignee"
  | "scope_creep";

export type FluxInsight = {
  id: string;
  boardId: string;
  type: FluxInsightType;
  severity: FluxInsightSeverity;
  title: string;
  description: string;
  affectedEntities: Array<{ type: string; id: string; name: string }>;
  suggestedAction: string;
  generatedAt: string;
};

const DAY_MS = 86400000;

function mkId(): string {
  return `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Heurísticas locais (sem IA) alinhadas à spec §5.4 — custo zero, idempotente.
 */
export function buildFluxIntelligenceInsights(params: {
  board: BoardData;
  sprint: SprintData | null;
  now?: Date;
}): FluxInsight[] {
  const now = params.now ?? new Date();
  const board = params.board;
  const sprint = params.sprint;
  const cards = (Array.isArray(board.cards) ? board.cards : []) as Array<Record<string, unknown>>;
  const out: FluxInsight[] = [];

  if (sprint && sprint.startDate && sprint.endDate) {
    const startMs = new Date(`${String(sprint.startDate).trim()}T12:00:00`).getTime();
    const endMs = new Date(`${String(sprint.endDate).trim()}T12:00:00`).getTime();
    const total = Math.max(1, (endMs - startMs) / DAY_MS);
    const elapsed = Math.max(0, (now.getTime() - startMs) / DAY_MS);
    const progressRatio = Math.min(1, total > 0 ? elapsed / total : 0);

    let completedPoints = 0;
    let totalPoints = 0;
    for (const c of cards) {
      if (!sprint.cardIds.includes(String(c.id))) continue;
      const sp = Number(c.storyPoints);
      const pts = Number.isFinite(sp) && sp > 0 ? sp : 1;
      totalPoints += pts;
      if (String(c.progress) === "Concluída" || String(c.bucket).toLowerCase() === "done") {
        completedPoints += pts;
      }
    }
    if (totalPoints > 0) {
      const completionRatio = completedPoints / totalPoints;
      const riskScore = progressRatio > 0 ? completionRatio / progressRatio : 1;
      const risk = Math.max(0, Math.min(1, 1 - riskScore));
      if (risk > 0.45) {
        out.push({
          id: mkId(),
          boardId: board.id,
          type: "sprint_risk",
          severity: risk > 0.65 ? "critical" : "warning",
          title: "Risco de conclusão do sprint",
          description: `Com ~${Math.round(progressRatio * 100)}% do tempo decorrido, ~${Math.round(completionRatio * 100)}% dos pontos planejados estão concluídos.`,
          affectedEntities: [{ type: "sprint", id: sprint.id, name: sprint.name }],
          suggestedAction: "Revisar escopo com o time, antecipar impedimentos e considerar mover itens de baixo valor.",
          generatedAt: now.toISOString(),
        });
      }
    }
  }

  const assigneeCounts = new Map<string, number>();
  for (const c of cards) {
    if (String(c.progress) === "Concluída") continue;
    const aid = c.assigneeId != null ? String(c.assigneeId) : "";
    if (!aid) continue;
    assigneeCounts.set(aid, (assigneeCounts.get(aid) ?? 0) + 1);
  }
  if (assigneeCounts.size > 0) {
    const vals = [...assigneeCounts.values()];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    for (const [uid, n] of assigneeCounts) {
      if (avg > 0 && n > avg * 1.5 && n >= 4) {
        out.push({
          id: mkId(),
          boardId: board.id,
          type: "member_overload",
          severity: n > avg * 2 ? "critical" : "warning",
          title: "Possível sobrecarga de assignee",
          description: `Um membro tem ${n} cards ativos acima da média (~${avg.toFixed(1)}).`,
          affectedEntities: [{ type: "member", id: uid, name: uid.slice(0, 8) }],
          suggestedAction: "Redistribuir itens, revisar WIP e alinhar expectativas de entrega.",
          generatedAt: now.toISOString(),
        });
      }
    }
  }

  let buggy = 0;
  for (const c of cards) {
    const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
    if (tags.some((t) => /bug|defeito/i.test(t))) buggy++;
  }
  if (buggy >= 5) {
    out.push({
      id: mkId(),
      boardId: board.id,
      type: "bug_concentration",
      severity: buggy >= 12 ? "critical" : "warning",
      title: "Alta densidade de itens tipo bug",
      description: `Há ${buggy} cards com label de bug no board.`,
      affectedEntities: [],
      suggestedAction: "Agrupar causa raiz, priorizar correções e reduzir retrabalho.",
      generatedAt: now.toISOString(),
    });
  }

  const blockedRoots = cards.filter((c) => Array.isArray(c.blockedBy) && (c.blockedBy as string[]).length > 0);
  if (blockedRoots.length >= 4) {
    out.push({
      id: mkId(),
      boardId: board.id,
      type: "blocked_chain",
      severity: "warning",
      title: "Cadeia de dependências",
      description: `${blockedRoots.length} cards possuem dependências explícitas (blockedBy) — risco de atraso em cascata.`,
      affectedEntities: blockedRoots.slice(0, 6).map((c) => ({ type: "card", id: String(c.id), name: String(c.title ?? "").slice(0, 80) })),
      suggestedAction: "Visualize o mapa de dependências e desbloqueie nós raiz primeiro.",
      generatedAt: now.toISOString(),
    });
  }

  if (out.length === 0) {
    out.push({
      id: mkId(),
      boardId: board.id,
      type: "velocity_trend",
      severity: "info",
      title: "Flux Intelligence",
      description: "Nenhum alerta crítico detectado agora. Continue acompanhando entregas e fluxo.",
      affectedEntities: [],
      suggestedAction: "Volte em algumas horas após atualizações no board para novos sinais.",
      generatedAt: now.toISOString(),
    });
  }

  return out;
}
