/**
 * Heurísticas de portfólio a partir dos cards do Kanban (sem histórico de conclusão).
 * Todos os índices 0–100: quanto maior, melhor (menos risco, mais fluxo, mais previsibilidade).
 */

export interface PortfolioCardLike {
  bucket?: string;
  priority?: string;
  progress?: string;
  dueDate?: string | null;
}

export interface PortfolioBucketLike {
  key?: string;
}

export interface PortfolioBoardLike {
  cards?: unknown[];
  config?: { bucketOrder?: PortfolioBucketLike[] };
  lastUpdated?: string;
}

export interface BoardPortfolioMetrics {
  risco: number | null;
  throughput: number | null;
  previsibilidade: number | null;
  cardCount: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function daysUntilDue(date: string | null | undefined): number | null {
  if (!date || typeof date !== "string") return null;
  const due = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function parseCards(raw: unknown): PortfolioCardLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    if (!c || typeof c !== "object") return {};
    const o = c as Record<string, unknown>;
    return {
      bucket: typeof o.bucket === "string" ? o.bucket : undefined,
      priority: typeof o.priority === "string" ? o.priority : undefined,
      progress: typeof o.progress === "string" ? o.progress : undefined,
      dueDate: o.dueDate === null || o.dueDate === undefined ? null : String(o.dueDate),
    };
  });
}

function bucketIndex(bucketKey: string | undefined, order: PortfolioBucketLike[]): number {
  if (!bucketKey || order.length === 0) return 0;
  const idx = order.findIndex((b) => b.key === bucketKey);
  return idx >= 0 ? idx : 0;
}

function parseLastUpdated(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Recência da última alteração no board (0–1), para compor throughput. */
function freshnessScore(lastUpdated?: string): number {
  const t = parseLastUpdated(lastUpdated);
  if (t === null) return 0.5;
  const days = (Date.now() - t) / 86400000;
  if (days <= 2) return 1;
  if (days <= 7) return 0.85;
  if (days <= 14) return 0.65;
  if (days <= 30) return 0.45;
  return 0.25;
}

export function computeBoardPortfolio(board: PortfolioBoardLike): BoardPortfolioMetrics {
  const cards = parseCards(board.cards);
  const n = cards.length;
  if (n === 0) {
    return { risco: null, throughput: null, previsibilidade: null, cardCount: 0 };
  }

  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  const maxIdx = Math.max(0, bucketOrder.length - 1);

  const isDone = (c: PortfolioCardLike) => c.progress === "Concluída";
  const open = cards.filter((c) => !isDone(c));
  const done = n - open.length;

  const overdueOpen = open.filter((c) => {
    const d = daysUntilDue(c.dueDate);
    return d !== null && d < 0;
  }).length;

  const urgentOpen = open.filter((c) => c.priority === "Urgente").length;
  const inProgress = open.filter((c) => c.progress === "Em andamento").length;
  const wipRatio = open.length > 0 ? inProgress / open.length : 0;

  let stagnationPenalty = 0;
  if (open.length > 0 && bucketOrder.length >= 2) {
    const early = open.filter((c) => bucketIndex(c.bucket, bucketOrder) <= 1).length;
    const earlyShare = early / open.length;
    if (earlyShare >= 0.72) stagnationPenalty = 18;
    else if (earlyShare >= 0.55) stagnationPenalty = 10;
  }

  let wipPenalty = 0;
  if (wipRatio > 0.42) wipPenalty = clamp((wipRatio - 0.42) * 110, 0, 28);

  const exposure = clamp(overdueOpen * 14 + urgentOpen * 9 + wipPenalty + stagnationPenalty, 0, 100);
  const risco = Math.round(100 - exposure);

  const completionRatio = done / n;
  let flowRatio = 0.5;
  if (open.length > 0 && maxIdx > 0) {
    const sumRank = open.reduce((acc, c) => acc + bucketIndex(c.bucket, bucketOrder) / maxIdx, 0);
    flowRatio = sumRank / open.length;
  } else if (open.length === 0) {
    flowRatio = 1;
  }
  const fresh = freshnessScore(board.lastUpdated);
  const throughput = Math.round(
    clamp(50 * completionRatio + 40 * flowRatio + 10 * fresh, 0, 100)
  );

  let previsibilidade: number;
  if (open.length === 0) {
    previsibilidade = 100;
  } else {
    const openWithDue = open.filter((c) => daysUntilDue(c.dueDate) !== null);
    if (openWithDue.length === 0) {
      previsibilidade = 46;
    } else {
      const notLate = openWithDue.filter((c) => {
        const d = daysUntilDue(c.dueDate);
        return d !== null && d >= 0;
      }).length;
      const punctuality = notLate / openWithDue.length;
      const coverage = openWithDue.length / open.length;
      previsibilidade = Math.round(clamp(punctuality * 72 + coverage * 28, 0, 100));
    }
  }

  return {
    risco,
    throughput,
    previsibilidade,
    cardCount: n,
  };
}

export function averageNullable(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
