import type { Organization } from "@/lib/kv-organizations";
import { computeKeyResultProgress } from "@/lib/okr-engine";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import type { PlanGateContext } from "@/lib/plan-gates";
import { canUseFeature } from "@/lib/plan-gates";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { getBoardAutomationRules } from "@/lib/kv-automations";
import { listObjectivesWithKeyResults } from "@/lib/kv-okrs";
import { listBoardsForUser, type BoardData } from "@/lib/kv-boards";
import type { DocChunkRag } from "@/lib/docs-rag";
import { retrieveRelevantDocChunks } from "@/lib/docs-rag";
import { listDependencySuggestionsForOrg } from "@/lib/kv-card-dependencies";
import { isMongoConfigured } from "@/lib/mongo";
import { getActiveSprint } from "@/lib/kv-sprints";
import { listBoardActivity } from "@/lib/kv-board-activity";
import { LSS_DMAIC_KEYS } from "@/lib/flux-reports-lss";
import { isKanbanMethodology, isScrumMethodology } from "@/lib/board-methodology";

/** ~4k tokens em contexto compacto PT-BR (heurística: ~4 chars/token). */
const MAX_SNAPSHOT_CHARS = 14_000;

export function getCurrentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

function clampText(s: string, max: number): string {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 12)}…[cortado]`;
}

function bucketKeysFromBoard(board: BoardData | Record<string, unknown>): Set<string> {
  const order = Array.isArray((board as BoardData)?.config?.bucketOrder) ? (board as BoardData).config!.bucketOrder! : [];
  return new Set(
    order
      .filter((b) => b && typeof b === "object")
      .map((b) => String((b as { key?: string }).key || "").trim())
      .filter(Boolean)
  );
}

type AutomationFire = {
  at: string;
  boardId: string;
  boardName: string;
  ruleId: string;
  ruleName: string;
};

function collectRecentAutomationFires(boards: BoardData[], rulesCache: Map<string, Awaited<ReturnType<typeof getBoardAutomationRules>>>, boardNames: Map<string, string>): AutomationFire[] {
  const fires: AutomationFire[] = [];

  for (const board of boards) {
    const rules = rulesCache.get(board.id) ?? [];
    const ruleNameById = new Map(rules.map((r) => [r.id, String(r.name || r.id)]));
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!card || typeof card !== "object") continue;
      const st = (card as { automationState?: { lastFired?: Record<string, string> } }).automationState;
      const lastFired = st?.lastFired;
      if (!lastFired || typeof lastFired !== "object") continue;
      for (const [ruleId, iso] of Object.entries(lastFired)) {
        if (typeof iso !== "string") continue;
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) continue;
        fires.push({
          at: iso,
          boardId: board.id,
          boardName: boardNames.get(board.id) || board.name || board.id,
          ruleId,
          ruleName: ruleNameById.get(ruleId) || ruleId,
        });
      }
    }
  }

  return fires.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function countDailiesLastDays(board: BoardData, days: number): number {
  const daily = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  const cutoff = Date.now() - days * 86400000;
  return daily.filter((d: unknown) => {
    const rec = d && typeof d === "object" ? (d as { createdAt?: string }) : null;
    const t = rec?.createdAt ? new Date(rec.createdAt).getTime() : NaN;
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

function latestDailyTimestampMs(board: BoardData): number | null {
  const daily = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  let best = 0;
  for (const d of daily) {
    const rec = d && typeof d === "object" ? (d as { createdAt?: string }) : null;
    const t = rec?.createdAt ? new Date(rec.createdAt).getTime() : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best > 0 ? best : null;
}

function inferCeremonyContextLabel(board: BoardData, hasActiveSprint: boolean): string {
  const lastDaily = latestDailyTimestampMs(board);
  const hoursSinceDaily = lastDaily != null ? (Date.now() - lastDaily) / 3600000 : null;
  if (hoursSinceDaily != null && hoursSinceDaily <= 36) {
    return hasActiveSprint
      ? "Provável foco: Daily/acompanhamento de sprint (há registro de daily recente)."
      : "Provável foco: sincronização do time (daily recente registrada).";
  }
  if (hasActiveSprint) {
    return "Sprint ativo sem daily muito recente; útil para planning review, riscos do sprint ou refinamento.";
  }
  return "Sem sprint ativo explícito; fluxo contínuo Kanban/LSS — priorize WIP, gargalos e políticas de coluna.";
}

function dmaicOpenDistribution(board: BoardData): string {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<{ bucket?: string; progress?: string }>) : [];
  const open = cards.filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")));
  const counts = new Map<string, number>();
  for (const k of LSS_DMAIC_KEYS) counts.set(k, 0);
  for (const c of open) {
    const bk = String(c.bucket || "").toLowerCase();
    for (const k of LSS_DMAIC_KEYS) {
      if (bk === k || bk.includes(k)) {
        counts.set(k, (counts.get(k) ?? 0) + 1);
        break;
      }
    }
  }
  return LSS_DMAIC_KEYS.map((k) => `${k}=${counts.get(k) ?? 0}`).join(", ");
}

/**
 * Monta o "world snapshot" org-wide para o Copilot: board atual (resumo), OKRs, automações, docs (RAG), métricas de portfólio/reports.
 * Comprime para caber em ~4k tokens.
 */
export async function buildCopilotWorldSnapshot(params: {
  orgId: string;
  userId: string;
  isAdmin: boolean;
  boardId: string;
  board: BoardData | Record<string, unknown>;
  userMessage: string;
  org: Organization | null;
  /** Se já buscou chunks no route, reutiliza (evita dupla chamada RAG). */
  ragChunks?: DocChunkRag[] | null;
  /** Admin da org: bypass de tier nos gates quando `FLUX_ADMIN_SUPERPOWERS` (sem depender do Stripe). */
  planGateCtx?: PlanGateContext;
}): Promise<{ snapshot: string; ragChunksUsed: DocChunkRag[] }> {
  const { orgId, userId, isAdmin, boardId, board, userMessage, org, ragChunks: preChunks, planGateCtx } = params;

  const boards = await listBoardsForUser(userId, orgId, isAdmin);
  const boardNames = new Map(boards.map((b) => [b.id, String(b.name || b.id)]));

  const rulesEntries = await Promise.all(boards.map(async (b) => [b.id, await getBoardAutomationRules(b.id, orgId)] as const));
  const rulesCache = new Map(rulesEntries);

  const lines: string[] = [];
  lines.push("# World snapshot (operações — compacto)");
  lines.push(`gerado=${new Date().toISOString()}`);
  lines.push(`boardAtualId=${boardId}`);
  lines.push(`boardAtualNome=${clampText(String((board as BoardData).name || "Board"), 120)}`);
  lines.push("");

  const curBoard = board as BoardData;
  const methodology = curBoard.boardMethodology;
  let activeSprint: Awaited<ReturnType<typeof getActiveSprint>> = null;
  try {
    activeSprint = await getActiveSprint(orgId, boardId);
  } catch {
    activeSprint = null;
  }
  const hasActiveSprint = Boolean(activeSprint);

  lines.push("## Contexto ágil (Fluxy context-aware)");
  lines.push(`metodologiaDeclarada=${methodology ?? "inferir_por_board"}`);
  if (methodology && isScrumMethodology(methodology)) {
    lines.push("modoAssistencia=Scrum: priorize sprint goal, commitment, impedimentos e Definition of Done.");
  } else if (methodology && isKanbanMethodology(methodology)) {
    lines.push("modoAssistencia=Kanban: priorize fluxo, WIP, lead time e políticas explícitas de coluna.");
  } else if (methodology === "lean_six_sigma") {
    lines.push("modoAssistencia=Lean_Six_Sigma: priorize fase DMAIC, evidências e critérios de tollgate.");
  } else {
    lines.push("modoAssistencia=misto/legado: combine boas práticas de fluxo com cerimônias se houver sprint.");
  }
  lines.push(`cerimoniaHeuristica=${clampText(inferCeremonyContextLabel(curBoard, hasActiveSprint), 220)}`);
  lines.push("");

  lines.push("## Sprint (board atual)");
  if (activeSprint) {
    lines.push(
      `id=${activeSprint.id}; nome=${clampText(activeSprint.name, 80)}; status=${activeSprint.status}; inicio=${activeSprint.startDate ?? "—"}; fim=${activeSprint.endDate ?? "—"}`
    );
    const cid = Array.isArray(activeSprint.cardIds) ? activeSprint.cardIds.length : 0;
    lines.push(`cardsNoSprint~${cid}`);
    if (activeSprint.goal) lines.push(`goal=${clampText(activeSprint.goal, 200)}`);
  } else {
    lines.push("(nenhum sprint com status active neste board)");
  }
  lines.push("");

  if (methodology === "lean_six_sigma" || curBoard.boardMethodology === "lean_six_sigma") {
    lines.push("## DMAIC — distribuição de cards abertos por fase (heurística por bucket key)");
    lines.push(dmaicOpenDistribution(curBoard));
    lines.push("");
  }

  lines.push("## Decisões recentes (activity log, últimas entradas)");
  if (isMongoConfigured()) {
    try {
      const acts = await listBoardActivity({ boardId, orgId, limit: 10 });
      if (!acts.length) {
        lines.push("(sem entradas recentes)");
      } else {
        for (const a of acts) {
          lines.push(
            `- ${a.timestamp} | ${a.action} | ${clampText(a.userName, 40)} | ${clampText(a.target, 100)}`
          );
        }
      }
    } catch {
      lines.push("(activity log indisponível)");
    }
  } else {
    lines.push("(MongoDB não configurado — sem histórico persistido)");
  }
  lines.push("");

  // --- Outros boards (nomes + métricas para comparação) ---
  lines.push("## Portfólio / relatórios (agregado)");
  const rows = boardsToPortfolioRows(boards);
  const agg = aggregatePortfolio(rows);
  lines.push(
    `boards=${agg.boardCount}; comCards=${agg.boardsWithCards}; riscoMedio=${agg.avgRisco ?? "—"}; throughputMedio=${agg.avgThroughput ?? "—"}; previsMedio=${agg.avgPrevisibilidade ?? "—"}; boardsRiscoBaixo=${agg.atRiskCount}`
  );
  const perBoard = [...rows]
    .sort((a, b) => (a.portfolio.throughput ?? 0) - (b.portfolio.throughput ?? 0))
    .slice(0, 8)
    .map((r) => {
      const mark = r.id === boardId ? "*" : "";
      return `${mark}${clampText(r.name, 40)}|risco=${r.portfolio.risco ?? "—"}|thr=${r.portfolio.throughput ?? "—"}|cards=${r.portfolio.cardCount}`;
    });
  lines.push(`amostraBoards(max8): ${perBoard.join(" || ")}`);
  lines.push("");

  lines.push("## Atividade (dailies últimos 7 dias, por board)");
  const act = boards
    .map((b) => `${clampText(String(b.name || b.id), 32)}:${countDailiesLastDays(b, 7)}`)
    .slice(0, 12);
  lines.push(act.join(" | "));
  lines.push("");

  // --- OKRs (quarter atual) ---
  if (canUseFeature(org, "okr_engine", planGateCtx)) {
    lines.push("## OKRs (quarter)");
    const quarter = getCurrentQuarterLabel();
    lines.push(`quarter=${quarter}`);
    try {
      const grouped = await listObjectivesWithKeyResults(orgId, quarter);
      const boardById = new Map(boards.map((b) => [b.id, b]));
      let okrLines = 0;
      const maxObjectives = 8;
      for (const g of grouped.slice(0, maxObjectives)) {
        const ot = clampText(g.objective.title, 80);
        lines.push(`obj: ${ot}`);
        for (const kr of g.keyResults.slice(0, 6)) {
          const linked = boardById.get(kr.linkedBoardId);
          const cards: Array<{ bucket?: string | null }> =
            linked && Array.isArray(linked.cards) ? (linked.cards as Array<{ bucket?: string | null }>) : [];
          const bk = linked ? bucketKeysFromBoard(linked) : undefined;
          const comp = computeKeyResultProgress({
            cards,
            keyResult: {
              id: kr.id,
              objectiveId: kr.objectiveId,
              title: kr.title,
              metric_type: kr.metric_type,
              target: kr.target,
              linkedBoardId: kr.linkedBoardId,
              linkedColumnKey: kr.linkedColumnKey,
              manualCurrent: kr.manualCurrent,
            },
            bucketKeys: bk,
          });
          const boardLabel = boardNames.get(kr.linkedBoardId) || kr.linkedBoardId;
          lines.push(
            `  kr: ${clampText(kr.title, 70)} | ${comp.current}/${kr.target} (${comp.pct}%) ${comp.status}${comp.linkBroken ? " [link coluna?]" : ""} | board=${clampText(boardLabel, 40)}`
          );
          okrLines++;
          if (okrLines > 24) break;
        }
        lines.push("");
        if (okrLines > 24) break;
      }
      if (grouped.length === 0) lines.push("(sem OKRs neste quarter)");
    } catch {
      lines.push("(OKRs indisponíveis no momento)");
    }
    lines.push("");
  } else {
    lines.push("## OKRs");
    lines.push("(recurso OKR não disponível no plano)");
    lines.push("");
  }

  // --- Automações: últimas 3 execuções (lastFired nos cards) ---
  lines.push("## Automações (últimas execuções registradas)");
  const fires = collectRecentAutomationFires(boards, rulesCache, boardNames).slice(0, 3);
  if (!fires.length) {
    lines.push("(nenhum lastFired recente nos cards acessíveis)");
  } else {
    for (const f of fires) {
      lines.push(`- ${f.at} | ${clampText(f.ruleName, 60)} | board=${clampText(f.boardName, 40)}`);
    }
  }
  lines.push("");

  // --- Docs RAG: top 5 trechos relevantes (dedup por doc) ---
  lines.push("## Documentos (trechos relevantes à pergunta)");
  let ragChunksUsed: DocChunkRag[] = [];
  if (canUseFeature(org, "flux_docs_rag", planGateCtx)) {
    const chunks = preChunks?.length ? preChunks : await retrieveRelevantDocChunks(orgId, userMessage, 12);
    const seen = new Set<string>();
    let n = 0;
    for (const c of chunks) {
      if (seen.has(c.docId)) continue;
      seen.add(c.docId);
      n++;
      ragChunksUsed.push(c);
      lines.push(`### ${clampText(c.docTitle, 80)}`);
      lines.push(clampText(c.text, 550));
      lines.push("");
      if (n >= 5) break;
    }
    if (n === 0) lines.push("(nenhum doc relevante indexado)");
  } else {
    lines.push("(RAG de docs não disponível no plano)");
  }
  lines.push("");

  // --- Board atual: só agregados (lista de cards vem no JSON `cards` do prompt) ---
  lines.push("## Board atual — agregados (detalhe dos cards no JSON `cards` do system prompt)");
  const cur = board as BoardData;
  const curPortfolio = computeBoardPortfolio(cur as PortfolioBoardLike);
  const cards = Array.isArray(cur.cards) ? (cur.cards as Record<string, unknown>[]) : [];
  lines.push(
    `metricas: risco=${curPortfolio.risco ?? "—"} throughput=${curPortfolio.throughput ?? "—"} previs=${curPortfolio.previsibilidade ?? "—"} totalCards=${cards.length}`
  );
  const open = cards.filter((c) => String(c?.progress || "") !== "Concluída").length;
  const done = cards.length - open;
  lines.push(`progresso: abertos~${open} concluidos~${done}`);

  lines.push("");
  lines.push("## Possíveis dependências cross-board (embeddings, score≥0.85)");
  if (isMongoConfigured() && canUseFeature(org, "portfolio_export", planGateCtx)) {
    try {
      const sugs = await listDependencySuggestionsForOrg(orgId, { boardId, minScore: 0.85, limit: 20 });
      if (!sugs.length) {
        lines.push("(nenhum par sugerido no último job — ajuste cards ou aguarde o cron)");
      } else {
        for (const s of sugs.slice(0, 12)) {
          lines.push(
            `- ${s.boardIdA}/${s.cardIdA} ↔ ${s.boardIdB}/${s.cardIdB} score=${s.score.toFixed(3)}`
          );
        }
      }
    } catch {
      lines.push("(sugestões indisponíveis no momento)");
    }
  } else {
    lines.push("(requer MongoDB + plano com relatórios)");
  }

  const snapshot = lines.join("\n");
  const out =
    snapshot.length <= MAX_SNAPSHOT_CHARS ? snapshot : `${snapshot.slice(0, MAX_SNAPSHOT_CHARS - 30)}\n…[snapshot truncado]`;
  return { snapshot: out, ragChunksUsed };
}
