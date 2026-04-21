const DAY_MS = 24 * 60 * 60 * 1000;

export type CoachInsightCategory = "flow" | "risk" | "opportunity" | "team" | "quality";
export type CoachInsightSeverity = "info" | "warning" | "critical";

export type CoachInsight = {
  id: string;
  category: CoachInsightCategory;
  severity: CoachInsightSeverity;
  headline: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  metric?: { label: string; value: string; trend?: "up" | "down" | "flat" };
};

export type FlowCoachResult = {
  score: number;
  scoreLabel: "excellent" | "good" | "fair" | "poor";
  insights: CoachInsight[];
  llmSummary?: string;
  generatedAt: string;
};

type CardLike = {
  id: string;
  title: string;
  bucket: string;
  progress: string;
  priority?: string;
  columnEnteredAt?: string;
  dueDate?: string | null;
  blockedBy?: string[];
  assignee?: string;
  assigneeId?: string;
};

type ColumnConfig = { key: string; label: string; wipLimit?: number };

function staleDays(card: CardLike, now: number): number {
  if (!card.columnEnteredAt) return 0;
  return (now - new Date(card.columnEnteredAt).getTime()) / DAY_MS;
}

export function computeFlowCoachInsights(
  cards: CardLike[],
  columns: ColumnConfig[],
  opts: { boardName?: string; locale?: string } = {}
): FlowCoachResult {
  const now = Date.now();
  const active = cards.filter((c) => c.progress !== "Concluída");
  const done = cards.filter((c) => c.progress === "Concluída");
  const insights: CoachInsight[] = [];

  // --- WIP analysis ---
  const wipMap = new Map<string, CardLike[]>();
  for (const col of columns) wipMap.set(col.key, []);
  for (const card of active) {
    const bucket = card.bucket ?? "";
    if (!wipMap.has(bucket)) wipMap.set(bucket, []);
    wipMap.get(bucket)!.push(card);
  }

  let overLimitCols = 0;
  for (const col of columns) {
    if (col.wipLimit && (wipMap.get(col.key)?.length ?? 0) > col.wipLimit) overLimitCols++;
  }
  if (overLimitCols > 0) {
    insights.push({
      id: "wip_exceeded",
      category: "flow",
      severity: overLimitCols > 2 ? "critical" : "warning",
      headline: `${overLimitCols} ${overLimitCols === 1 ? "coluna excede" : "colunas excedem"} o limite WIP`,
      body: "Excesso de WIP reduz o foco e aumenta o tempo de ciclo. Conclua ou bloqueie itens antes de iniciar novos.",
      metric: { label: "Colunas em violação", value: String(overLimitCols), trend: "up" },
    });
  }

  // --- Stale cards ---
  const staleThreshold = 5;
  const staleCards = active.filter((c) => staleDays(c, now) >= staleThreshold);
  if (staleCards.length > 0) {
    insights.push({
      id: "stale_cards",
      category: "risk",
      severity: staleCards.length > 4 ? "critical" : "warning",
      headline: `${staleCards.length} ${staleCards.length === 1 ? "card está parado" : "cards parados"} há mais de ${staleThreshold} dias`,
      body: `"${staleCards[0].title}" é o mais antigo. Cards parados indicam bloqueios ocultos ou falta de priorização.`,
      metric: { label: "Cards estagnados", value: String(staleCards.length), trend: "up" },
    });
  }

  // --- Blocked chain ---
  const blockedIds = new Set(active.filter((c) => (c.blockedBy?.length ?? 0) > 0).map((c) => c.id));
  const chainLength = blockedIds.size;
  if (chainLength > 0) {
    insights.push({
      id: "blocked_chain",
      category: "risk",
      severity: chainLength > 3 ? "critical" : "warning",
      headline: `${chainLength} ${chainLength === 1 ? "card bloqueado" : "cards bloqueados"}`,
      body: "Desbloqueie esses cards priorizando suas dependências. Bloqueios em cadeia são o principal risco de atraso.",
      metric: { label: "Cards bloqueados", value: String(chainLength), trend: "up" },
    });
  }

  // --- Overdue ---
  const overdue = active.filter((c) => {
    if (!c.dueDate) return false;
    return new Date(c.dueDate).getTime() < now;
  });
  if (overdue.length > 0) {
    insights.push({
      id: "overdue",
      category: "risk",
      severity: "critical",
      headline: `${overdue.length} ${overdue.length === 1 ? "card vencido" : "cards vencidos"}`,
      body: `"${overdue[0].title}" já passou do prazo. Reassine ou replaneje imediatamente.`,
      metric: { label: "Vencidos", value: String(overdue.length), trend: "up" },
    });
  }

  // --- Flow throughput ---
  const completedLast7 = done.filter((c) => {
    const ts = (c as Record<string, unknown>).completedAt ?? c.columnEnteredAt;
    if (!ts || typeof ts !== "string") return false;
    return now - new Date(ts).getTime() <= 7 * DAY_MS;
  }).length;
  const completedPrev7 = done.filter((c) => {
    const ts = (c as Record<string, unknown>).completedAt ?? c.columnEnteredAt;
    if (!ts || typeof ts !== "string") return false;
    const age = now - new Date(ts).getTime();
    return age > 7 * DAY_MS && age <= 14 * DAY_MS;
  }).length;

  if (completedLast7 > 0 && completedPrev7 > 0) {
    const delta = completedLast7 - completedPrev7;
    if (delta >= 2) {
      insights.push({
        id: "throughput_up",
        category: "opportunity",
        severity: "info",
        headline: `Throughput subiu ${delta} cards esta semana`,
        body: "O time está entregando mais rápido do que na semana anterior. Momento ideal para assumir cards de alta prioridade.",
        metric: { label: "Throughput 7d", value: String(completedLast7), trend: "up" },
      });
    } else if (delta <= -2) {
      insights.push({
        id: "throughput_down",
        category: "flow",
        severity: "warning",
        headline: `Throughput caiu ${Math.abs(delta)} cards esta semana`,
        body: "O ritmo de entrega diminuiu. Investigue se há aumento de complexidade ou distrações externas.",
        metric: { label: "Throughput 7d", value: String(completedLast7), trend: "down" },
      });
    }
  }

  // --- No-description cards ---
  const noDesc = active.filter((c) => {
    const d = (c as Record<string, unknown>).desc ?? "";
    return typeof d === "string" && d.trim().length < 20;
  });
  if (noDesc.length >= 3) {
    insights.push({
      id: "no_description",
      category: "quality",
      severity: "info",
      headline: `${noDesc.length} cards sem descrição adequada`,
      body: "Cards mal descritos geram retrabalho e mal-entendidos. Detalhe critérios de aceite antes do próximo planning.",
      metric: { label: "Sem descrição", value: String(noDesc.length), trend: "flat" },
    });
  }

  // --- Positive signal ---
  if (insights.length === 0) {
    insights.push({
      id: "on_track",
      category: "opportunity",
      severity: "info",
      headline: "Board em ótimo estado",
      body: "Nenhum sinal crítico detectado. Mantenha o ritmo e considere planejar o próximo sprint.",
      metric: { label: "Score", value: "100", trend: "up" },
    });
  }

  // --- Score ---
  const penalties = {
    wip_exceeded: overLimitCols * 10,
    stale_cards: Math.min(staleCards.length * 5, 25),
    blocked_chain: Math.min(chainLength * 8, 24),
    overdue: Math.min(overdue.length * 12, 36),
  };
  const totalPenalty = Object.values(penalties).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, 100 - totalPenalty));

  const scoreLabel: FlowCoachResult["scoreLabel"] =
    score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

  return {
    score,
    scoreLabel,
    insights: insights.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

export function buildFlowCoachPrompt(
  result: Omit<FlowCoachResult, "llmSummary">,
  boardName: string,
  locale: string
): string {
  const lang = locale.startsWith("pt") ? "português brasileiro" : "English";
  return `Você é um Agile Coach especialista. Analise o estado do board "${boardName}" e forneça um resumo executivo curto (3-4 linhas) em ${lang}.

Score do board: ${result.score}/100 (${result.scoreLabel})

Sinais detectados:
${result.insights.map((i) => `- [${i.severity.toUpperCase()}] ${i.headline}: ${i.body}`).join("\n")}

Forneça um resumo direto, sem bullet points, como um coach experiente falaria para o time. Seja específico e acionável.`;
}
