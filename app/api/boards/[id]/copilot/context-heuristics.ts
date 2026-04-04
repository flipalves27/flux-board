import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";

const MAX_MODEL_CONTEXT_DAILIES = 5;

function normalizeTitle(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function daysUntilDue(date: string | null | undefined): number | null {
  if (!date || typeof date !== "string") return null;
  const due = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

export function buildCopilotContext(board: Record<string, unknown>): {
  bucketLabels: Array<{ key: string; label: string }>;
  cards: Array<Record<string, unknown>>;
  portfolio: ReturnType<typeof computeBoardPortfolio>;
  executionInsights: {
    inProgress: number;
    overdue: number;
    dueSoon: number;
    doneRate: number;
    urgent: number;
    nextActions: Array<Record<string, unknown>>;
    wipRiskColumns: Array<Record<string, unknown>>;
  };
  latestDailies: Array<Record<string, unknown>>;
  activityHints: Array<Record<string, unknown>>;
} {
  const boardConfig = (board.config ?? {}) as Record<string, unknown>;
  const bucketOrder = Array.isArray(boardConfig.bucketOrder) ? boardConfig.bucketOrder : [];
  const bucketLabels = bucketOrder
    .filter((b) => b && typeof b === "object")
    .map((b) => {
      const row = b as Record<string, unknown>;
      return { key: String(row.key || ""), label: String(row.label || "") };
    })
    .filter((b) => b.key && b.label);

  const boardCards = Array.isArray(board.cards) ? board.cards : [];
  const cards = boardCards.map((c, idx) => {
    const card = (c ?? {}) as Record<string, unknown>;
    return {
      id: String(card.id || "").trim() || `card_${idx}`,
      bucket: String(card.bucket || "").trim(),
      priority: String(card.priority || "").trim(),
      progress: String(card.progress || "").trim(),
      title: String(card.title || "").trim(),
      desc: String(card.desc || ""),
      tags: Array.isArray(card.tags) ? card.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
      direction: card.direction == null ? null : String(card.direction),
      dueDate: card.dueDate == null ? null : String(card.dueDate),
      order: typeof card.order === "number" && Number.isFinite(card.order) ? card.order : idx,
    } as Record<string, unknown>;
  });

  const portfolio = computeBoardPortfolio(board);
  const open = cards.filter((c) => c.progress !== "Concluída");
  const inProgress = cards.filter((c) => c.progress === "Em andamento").length;
  const done = cards.filter((c) => c.progress === "Concluída").length;
  const urgent = cards.filter((c) => c.priority === "Urgente").length;
  const overdue = open.filter((c) => {
    const d = daysUntilDue((c.dueDate as string | null | undefined) ?? null);
    return d !== null && d < 0;
  }).length;
  const dueSoon = open.filter((c) => {
    const d = daysUntilDue((c.dueDate as string | null | undefined) ?? null);
    return d !== null && d >= 0 && d <= 3;
  }).length;
  const doneRate = cards.length ? Math.round((done / cards.length) * 100) : 0;

  const priorityWeight: Record<string, number> = { Urgente: 4, Importante: 2, "Média": 1 };
  const progressWeight: Record<string, number> = { "Não iniciado": 2, "Em andamento": 3, "Concluída": 0 };
  const now = Date.now();

  const nextActions = [...cards]
    .filter((c) => c.progress !== "Concluída")
    .map((c) => {
      const due = daysUntilDue((c.dueDate as string | null | undefined) ?? null);
      const dueScore = due === null ? 0 : due < 0 ? 5 : due <= 2 ? 4 : due <= 5 ? 2 : 1;
      const score =
        (priorityWeight[String(c.priority)] ?? 1) +
        (progressWeight[String(c.progress)] ?? 1) +
        dueScore +
        (String(c.direction || "").toLowerCase() === "priorizar" ? 2 : 0);
      return { card: c, score, due };
    })
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 3);

  const wipRiskColumns = bucketLabels
    .map((b) => {
      const count = cards.filter((c) => c.bucket === b.key && c.progress === "Em andamento").length;
      return { key: b.key, label: b.label, count };
    })
    .filter((entry) => entry.count >= 4)
    .sort((a, b) => b.count - a.count);

  const dailyInsights = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  const dailySortedDesc = [...dailyInsights].sort((a, b) => {
    const aa = (a ?? {}) as Record<string, unknown>;
    const bb = (b ?? {}) as Record<string, unknown>;
    const ta = new Date(String(aa.createdAt || 0)).getTime();
    const tb = new Date(String(bb.createdAt || 0)).getTime();
    return tb - ta;
  });

  const lastMentionByTitle = new Map<string, number>();
  for (const entryRaw of dailySortedDesc.slice(0, 30)) {
    const entry = (entryRaw ?? {}) as Record<string, unknown>;
    const ts = entry.createdAt ? new Date(String(entry.createdAt)).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    const insight = (entry.insight ?? {}) as Record<string, unknown>;
    const mentioned: string[] = [];
    if (Array.isArray(insight.criar)) mentioned.push(...insight.criar.map((x) => String(x || "")));
    if (Array.isArray(insight.criarDetalhes)) {
      mentioned.push(
        ...insight.criarDetalhes.map((x) => {
          const row = (x ?? {}) as Record<string, unknown>;
          return String(row.titulo || row.title || "");
        })
      );
    }
    for (const k of ["ajustar", "corrigir", "pendencias"]) {
      const list = insight[k];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === "string") mentioned.push(item);
        else {
          const row = (item ?? {}) as Record<string, unknown>;
          mentioned.push(String(row.titulo || row.title || ""));
        }
      }
    }
    for (const t of mentioned) {
      const nt = normalizeTitle(t);
      if (!nt) continue;
      if (!lastMentionByTitle.has(nt)) lastMentionByTitle.set(nt, ts);
    }
  }

  const fallbackTs = (() => {
    const lt = new Date(String(board.lastUpdated || 0)).getTime();
    const ct = new Date(String(board.createdAt || 0)).getTime();
    const t = Number.isFinite(lt) ? lt : Number.isFinite(ct) ? ct : null;
    return t ?? null;
  })();

  const activityHints = cards.map((c) => {
    const ts = lastMentionByTitle.get(normalizeTitle(String(c.title || "")));
    const effectiveTs = typeof ts === "number" ? ts : fallbackTs;
    const days = effectiveTs ? Math.floor((now - effectiveTs) / 86400000) : 9999;
    return {
      cardId: c.id,
      title: c.title,
      bucket: c.bucket,
      priority: c.priority,
      progress: c.progress,
      tags: c.tags,
      dueDate: c.dueDate,
      lastMentionedAt: effectiveTs ? new Date(effectiveTs).toISOString() : null,
      daysSinceMentioned: days,
    } as Record<string, unknown>;
  });

  const latestDailies = dailySortedDesc.slice(0, MAX_MODEL_CONTEXT_DAILIES).map((eRaw) => {
    const e = (eRaw ?? {}) as Record<string, unknown>;
    const insight = (e.insight ?? {}) as Record<string, unknown>;
    return {
      id: String(e.id || ""),
      createdAt: e.createdAt ? String(e.createdAt) : undefined,
      transcriptSnippet: e.transcript ? String(e.transcript).slice(0, 400) : undefined,
      resumo: insight.resumo ? String(insight.resumo).slice(0, 600) : undefined,
      createdCards: Array.isArray(e.createdCards)
        ? e.createdCards.slice(0, 12).map((cc) => {
            const card = (cc ?? {}) as Record<string, unknown>;
            return {
              title: String(card.title || ""),
              bucket: String(card.bucket || ""),
              priority: String(card.priority || ""),
              progress: String(card.progress || ""),
            };
          })
        : undefined,
    } as Record<string, unknown>;
  });

  return {
    bucketLabels,
    cards,
    portfolio,
    executionInsights: { inProgress, overdue, dueSoon, doneRate, urgent, nextActions, wipRiskColumns },
    latestDailies,
    activityHints,
  };
}

export function heuristicWeeklyBrief(board: Record<string, unknown>): string {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const daily = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  const recent = daily
    .filter((d) => {
      const row = (d ?? {}) as Record<string, unknown>;
      const ts = row.createdAt ? new Date(String(row.createdAt)).getTime() : NaN;
      return Number.isFinite(ts) && ts >= weekAgo;
    })
    .sort((a, b) => {
      const aa = (a ?? {}) as Record<string, unknown>;
      const bb = (b ?? {}) as Record<string, unknown>;
      return new Date(String(bb.createdAt || 0)).getTime() - new Date(String(aa.createdAt || 0)).getTime();
    })
    .slice(0, 7);

  const { portfolio, executionInsights } = buildCopilotContext(board);
  const lines: string[] = [];
  lines.push("# Brief semanal — Flux-Board", "", `- Gerado em: ${new Date().toISOString()}`);
  if (board.name) lines.push(`- Board: ${String(board.name)}`);
  lines.push(
    "",
    "## Métricas (heurísticas)",
    `- Risco: ${String(portfolio.risco ?? "—")}`,
    `- Throughput: ${String(portfolio.throughput ?? "—")}`,
    `- Previsibilidade: ${String(portfolio.previsibilidade ?? "—")}`,
    `- Em andamento: ${executionInsights.inProgress}`,
    `- Overdue: ${executionInsights.overdue}`,
    `- Due em até 3 dias: ${executionInsights.dueSoon}`,
    `- Taxa de concluídas: ${executionInsights.doneRate}%`,
    "",
    "## Dailies da semana (resumo)"
  );
  if (!recent.length) {
    lines.push("- Sem dailies na janela de 7 dias.", "");
  } else {
    for (const eRaw of recent) {
      const e = (eRaw ?? {}) as Record<string, unknown>;
      const insight = (e.insight ?? {}) as Record<string, unknown>;
      const dt = e.createdAt ? new Date(String(e.createdAt)).toLocaleDateString("pt-BR") : "";
      const resumo = insight.resumo ? String(insight.resumo).trim() : "";
      lines.push(`- ${dt}: ${resumo || "Sem resumo disponível."}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function copilotHeuristicWhenNoLlm(input: {
  board: Record<string, unknown>;
  userMessage: string;
}): { reply: string; actions: []; llm: { source: "heuristic"; model: string } } {
  const ctx = buildCopilotContext(input.board);
  const s = String(input.userMessage || "").toLowerCase();
  if (s.includes("parad") && (s.includes("5") || s.includes("mais de"))) {
    const stuck = ctx.activityHints
      .filter((h) => Number(h.daysSinceMentioned ?? 0) > 5 && h.progress !== "Concluída")
      .sort((a, b) => Number(b.daysSinceMentioned ?? 0) - Number(a.daysSinceMentioned ?? 0))
      .slice(0, 12);
    const lines: string[] = ["# Cards possivelmente parados (> 5 dias)"];
    if (!stuck.length) lines.push("- Não encontrei cards com indicação de estagnação pelo histórico de dailies.");
    else {
      for (const h of stuck) {
        lines.push(`- ${String(h.title || "")} (id: ${String(h.cardId || "")}) • ${String(h.bucket || "")} • ${String(h.daysSinceMentioned || 0)} dia(s) desde última menção`);
      }
    }
    return { reply: lines.join("\n"), actions: [], llm: { source: "heuristic", model: "Heurístico local" } };
  }
  if (/(resuma|brief|diret(or|oria)|semana)/i.test(s)) {
    return { reply: heuristicWeeklyBrief(input.board), actions: [], llm: { source: "heuristic", model: "Heurístico local" } };
  }
  return {
    reply:
      "Modo sem IA cloud habilitada (configure TOGETHER_API_KEY/TOGETHER_MODEL e/ou ANTHROPIC_API_KEY). Posso responder por heurística: cards parados por dailies e brief semanal.",
    actions: [],
    llm: { source: "heuristic", model: "Heurístico local" },
  };
}

