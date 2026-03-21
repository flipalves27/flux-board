import type { BoardData } from "@/lib/kv-boards";
import {
  buildRollingWeekRanges,
  buildWeeklyConcludedByBoardFromCopilot,
  type CopilotChatDocLike,
  type FluxWeekRange,
} from "@/lib/flux-reports-metrics";
import { callTogetherApi, extractTextFromLlmContent, safeJsonParse } from "@/lib/llm-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export type NlqMetricTimeRange =
  | "last_calendar_week"
  | "this_calendar_week"
  | "previous_calendar_week";

export type NlqMetricSpec = {
  metric: "throughput";
  timeRange: NlqMetricTimeRange;
  compare?: "previous_calendar_week" | null;
};

export type NlqField =
  | "priority"
  | "progress"
  | "bucket"
  | "columnEnteredAt"
  | "ownerPresent"
  | "dueDate";

export type NlqOperator = "eq" | "ne" | "in" | "older_than" | "newer_than" | "is_true" | "is_false";

export type NlqCondition = {
  field: NlqField;
  operator: NlqOperator;
  value?: string | string[];
};

export type NlqFilterAst = NlqCondition | { and: NlqFilterAst[] } | { or: NlqFilterAst[] };

export type NlqPlan =
  | { kind: "card_filter"; filter: NlqFilterAst }
  | { kind: "metric"; metric: NlqMetricSpec }
  | { kind: "unparseable"; reason?: string };

export type NlqCardRow = {
  id: string;
  title: string;
  priority: string;
  progress: string;
  bucket: string;
  bucketLabel: string;
  owner: string;
};

export type NlqMetricChartPoint = { label: string; value: number };

export type NlqSuccessCards = {
  ok: true;
  resultType: "cards";
  cardIds: string[];
  rows: NlqCardRow[];
  explanation: string;
};

export type NlqSuccessMetric = {
  ok: true;
  resultType: "metric";
  metric: "throughput";
  primaryValue: number;
  compareValue: number | null;
  chart: NlqMetricChartPoint[];
  explanation: string;
};

export type NlqErrorResponse = {
  ok: false;
  fallbackMessage: string;
  suggestions: string[];
};

export type NlqApiResponse = NlqSuccessCards | NlqSuccessMetric | NlqErrorResponse;

const NLQ_SUGGESTIONS_PT = [
  "cards urgentes sem dono",
  "throughput semana passada",
  "compare o throughput desta semana vs a anterior",
  "quais cards estão parados há mais de 5 dias?",
];

function fallbackUnparseable(): NlqErrorResponse {
  return {
    ok: false,
    fallbackMessage:
      "Não entendi, tente algo como: «cards urgentes sem dono», «throughput semana passada» ou «compare throughput desta semana com a anterior».",
    suggestions: [...NLQ_SUGGESTIONS_PT],
  };
}

function cardRecord(card: unknown): Record<string, unknown> | null {
  if (!card || typeof card !== "object") return null;
  return card as Record<string, unknown>;
}

function cardIdOf(card: unknown): string | null {
  const rec = cardRecord(card);
  const id = rec?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function cardOwnerDisplay(card: unknown): string {
  const rec = cardRecord(card);
  if (!rec) return "";
  const o = rec.owner;
  const a = rec.assignee;
  if (typeof o === "string" && o.trim()) return o.trim();
  if (typeof a === "string" && a.trim()) return a.trim();
  return "";
}

function bucketList(board: BoardData): Array<{ key: string; label: string }> {
  const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  return order
    .filter((b) => b && typeof b === "object")
    .map((b) => {
      const r = b as Record<string, unknown>;
      return { key: String(r.key || ""), label: String(r.label || r.key || "") };
    })
    .filter((b) => b.key);
}

export function resolveBucketKeyNlq(board: BoardData, raw: string): string | null {
  const list = bucketList(board);
  const q = String(raw || "").trim().toLowerCase();
  if (!q) return null;
  const byKey = list.find((b) => b.key.toLowerCase() === q);
  if (byKey) return byKey.key;
  const byLabel = list.find((b) => b.label.toLowerCase() === q);
  if (byLabel) return byLabel.key;
  const partial = list.find((b) => b.label.toLowerCase().includes(q) || b.key.toLowerCase().includes(q));
  return partial?.key ?? null;
}

function parseDurationToMs(value: string): number | null {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const m = s.match(/^(\d+)\s*(day|days|dia|dias)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * DAY_MS;
}

function evalCondition(board: BoardData, card: unknown, c: NlqCondition, nowMs: number): boolean {
  const rec = cardRecord(card);
  if (!rec) return false;

  const str = (k: string) => String(rec[k] ?? "");
  const enteredRaw = str("columnEnteredAt");
  const enteredMs = enteredRaw ? new Date(enteredRaw).getTime() : NaN;

  switch (c.field) {
    case "priority": {
      const v = str("priority");
      if (c.operator === "eq") return v === String(c.value || "");
      if (c.operator === "ne") return v !== String(c.value || "");
      if (c.operator === "in" && Array.isArray(c.value)) return c.value.map(String).includes(v);
      return false;
    }
    case "progress": {
      const v = str("progress");
      if (c.operator === "eq") return v === String(c.value || "");
      if (c.operator === "ne") return v !== String(c.value || "");
      if (c.operator === "in" && Array.isArray(c.value)) return c.value.map(String).includes(v);
      return false;
    }
    case "bucket": {
      const v = str("bucket");
      const target = String(c.value || "");
      const key = resolveBucketKeyNlq(board, target);
      const want = key ?? target;
      if (c.operator === "eq") return v === want;
      if (c.operator === "ne") return v !== want;
      return false;
    }
    case "columnEnteredAt": {
      if (!enteredRaw || Number.isNaN(enteredMs)) return false;
      const dur = typeof c.value === "string" ? parseDurationToMs(c.value) : null;
      if (dur === null) return false;
      const age = nowMs - enteredMs;
      if (c.operator === "older_than") return age >= dur;
      if (c.operator === "newer_than") return age < dur;
      return false;
    }
    case "ownerPresent": {
      const has = Boolean(cardOwnerDisplay(card));
      if (c.operator === "is_true") return has;
      if (c.operator === "is_false") return !has;
      return false;
    }
    case "dueDate": {
      const dueRaw = str("dueDate");
      if (!dueRaw) return c.operator === "is_false";
      const due = new Date(`${dueRaw.trim()}T00:00:00`).getTime();
      if (Number.isNaN(due)) return false;
      const dur = typeof c.value === "string" ? parseDurationToMs(c.value) : null;
      if (c.operator === "older_than" && dur !== null) return nowMs - due >= dur;
      if (c.operator === "newer_than" && dur !== null) return due - nowMs >= dur;
      return false;
    }
    default:
      return false;
  }
}

export function evalNlqFilterAst(board: BoardData, card: unknown, ast: NlqFilterAst, nowMs: number): boolean {
  if ("and" in ast) {
    return ast.and.every((x) => evalNlqFilterAst(board, card, x, nowMs));
  }
  if ("or" in ast) {
    if (!ast.or.length) return false;
    return ast.or.some((x) => evalNlqFilterAst(board, card, x, nowMs));
  }
  return evalCondition(board, card, ast, nowMs);
}

export function filterBoardCardsByNlq(board: BoardData, ast: NlqFilterAst, nowMs = Date.now()): NlqCardRow[] {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const labels = new Map(bucketList(board).map((b) => [b.key, b.label]));
  const rows: NlqCardRow[] = [];
  for (const card of cards) {
    if (!evalNlqFilterAst(board, card, ast, nowMs)) continue;
    const id = cardIdOf(card);
    if (!id) continue;
    const rec = cardRecord(card)!;
    const bk = String(rec.bucket || "");
    rows.push({
      id,
      title: String(rec.title || ""),
      priority: String(rec.priority || ""),
      progress: String(rec.progress || ""),
      bucket: bk,
      bucketLabel: labels.get(bk) ?? bk,
      owner: cardOwnerDisplay(card),
    });
  }
  return rows;
}

/** Segunda-feira 00:00 UTC da semana que contém `d`. */
export function startOfIsoWeekUtc(d: Date): Date {
  const x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(x).getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const t = new Date(x);
  t.setUTCDate(t.getUTCDate() + diff);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

export function calendarIsoWeekRangeUtc(weeksAgo: number, ref = new Date()): FluxWeekRange {
  const monday = startOfIsoWeekUtc(ref);
  const start = new Date(monday);
  start.setUTCDate(start.getUTCDate() - 7 * weeksAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const label = `${String(start.getUTCDate()).padStart(2, "0")}/${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { label, startMs: start.getTime(), endMs: end.getTime() };
}

function inRange(tsMs: number, startMs: number, endMs: number): boolean {
  return tsMs >= startMs && tsMs < endMs;
}

export function countThroughputInRange(
  chats: CopilotChatDocLike[],
  boardId: string,
  range: FluxWeekRange
): number {
  const weeks = [range];
  const row = buildWeeklyConcludedByBoardFromCopilot(chats, boardId, weeks);
  return row[0] ?? 0;
}

export function buildNlqThroughputMetric(args: {
  chats: CopilotChatDocLike[];
  boardId: string;
  spec: NlqMetricSpec;
  nowMs?: number;
}): { primaryValue: number; compareValue: number | null; chart: NlqMetricChartPoint[]; explanation: string } {
  const nowMs = args.nowMs ?? Date.now();
  const { chats, boardId, spec } = args;

  const rolling = buildRollingWeekRanges(4, nowMs);
  const rollingCounts = buildWeeklyConcludedByBoardFromCopilot(chats, boardId, rolling);
  const chart: NlqMetricChartPoint[] = rolling.map((w, i) => ({
    label: w.label,
    value: rollingCounts[i] ?? 0,
  }));

  let primaryValue = 0;
  let compareValue: number | null = null;
  let explanation = "";

  if (spec.timeRange === "last_calendar_week") {
    const w = calendarIsoWeekRangeUtc(1, new Date(nowMs));
    primaryValue = countThroughputInRange(chats, boardId, w);
    explanation = `Throughput (conclusões registradas via Copilot) na semana ISO ${w.label}–${new Date(w.endMs - 1).toISOString().slice(5, 10)}: ${primaryValue}.`;
  } else if (spec.timeRange === "this_calendar_week") {
    const start = calendarIsoWeekRangeUtc(0, new Date(nowMs));
    const endMs = Math.max(nowMs, start.startMs + 1);
    const partial: FluxWeekRange = { ...start, endMs };
    primaryValue = countThroughputInRange(chats, boardId, partial);
    explanation = `Throughput parcial desta semana (até agora): ${primaryValue}.`;
    if (spec.compare === "previous_calendar_week") {
      const prev = calendarIsoWeekRangeUtc(1, new Date(nowMs));
      compareValue = countThroughputInRange(chats, boardId, prev);
      explanation = `Esta semana (parcial): ${primaryValue} vs semana anterior (fechada): ${compareValue ?? 0}.`;
    }
  } else if (spec.timeRange === "previous_calendar_week") {
    const w = calendarIsoWeekRangeUtc(1, new Date(nowMs));
    primaryValue = countThroughputInRange(chats, boardId, w);
    explanation = `Throughput da semana anterior: ${primaryValue}.`;
  }

  return { primaryValue, compareValue, chart, explanation };
}

export function tryNlqHeuristic(query: string): NlqPlan | null {
  const s = query.trim().toLowerCase();

  if (
    /urgentes?\s+sem\s+dono/.test(s) ||
    /cards?\s+urgentes?\s+sem\s+dono/.test(s) ||
    /urgente\s+sem\s+dono/.test(s)
  ) {
    return {
      kind: "card_filter",
      filter: {
        and: [
          { field: "priority", operator: "eq", value: "Urgente" },
          { field: "ownerPresent", operator: "is_false" },
        ],
      },
    };
  }

  if (
    /throughput\s+(da\s+)?semana\s+passada/.test(s) ||
    /conclus(õ|o)es\s+(da\s+)?semana\s+passada/.test(s)
  ) {
    return { kind: "metric", metric: { metric: "throughput", timeRange: "last_calendar_week" } };
  }

  if (/(compare|vs\.?|versus)/.test(s) && /throughput|conclus/.test(s) && /semana/.test(s)) {
    return {
      kind: "metric",
      metric: { metric: "throughput", timeRange: "this_calendar_week", compare: "previous_calendar_week" },
    };
  }

  if (/(parad|parados|estagn|sem\s+movimento).*(5|\bcinco\b)/.test(s) || /(5|\bcinco\b).*(dia|dias).*(parad|movimento)/.test(s)) {
    return {
      kind: "card_filter",
      filter: {
        and: [
          { field: "columnEnteredAt", operator: "older_than", value: "5 days" },
          { field: "progress", operator: "ne", value: "Concluída" },
        ],
      },
    };
  }

  return null;
}

type LlmNlqShape = {
  kind?: string;
  filter?: unknown;
  metric?: unknown;
};

function isCondition(x: unknown): x is NlqCondition {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.field === "string" && typeof o.operator === "string";
}

function normalizeFilterAst(raw: unknown): NlqFilterAst | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.and)) {
    const parts = o.and.map(normalizeFilterAst).filter(Boolean) as NlqFilterAst[];
    if (!parts.length) return null;
    return { and: parts };
  }
  if (Array.isArray(o.or)) {
    const parts = o.or.map(normalizeFilterAst).filter(Boolean) as NlqFilterAst[];
    if (!parts.length) return null;
    return { or: parts };
  }
  if (isCondition(raw)) {
    const field = raw.field as NlqField;
    const allowed: NlqField[] = ["priority", "progress", "bucket", "columnEnteredAt", "ownerPresent", "dueDate"];
    if (!allowed.includes(field)) return null;
    return {
      field,
      operator: raw.operator as NlqOperator,
      value: raw.value as string | string[] | undefined,
    };
  }
  return null;
}

function normalizeMetricSpec(raw: unknown): NlqMetricSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.metric !== "throughput") return null;
  const tr = o.timeRange;
  const allowed: NlqMetricTimeRange[] = ["last_calendar_week", "this_calendar_week", "previous_calendar_week"];
  if (typeof tr !== "string" || !allowed.includes(tr as NlqMetricTimeRange)) return null;
  const cmp = o.compare;
  return {
    metric: "throughput",
    timeRange: tr as NlqMetricTimeRange,
    compare: cmp === "previous_calendar_week" ? "previous_calendar_week" : null,
  };
}

function planFromLlmJson(obj: LlmNlqShape): NlqPlan | null {
  if (obj.kind === "card_filter") {
    const f = normalizeFilterAst(obj.filter);
    if (!f) return null;
    return { kind: "card_filter", filter: f };
  }
  if (obj.kind === "metric") {
    const m = normalizeMetricSpec(obj.metric);
    if (!m) return null;
    return { kind: "metric", metric: m };
  }
  if (obj.kind === "unparseable") {
    return { kind: "unparseable", reason: "model" };
  }
  return null;
}

export async function parseNlqWithLlm(query: string, bucketHints: Array<{ key: string; label: string }>): Promise<NlqPlan | null> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  if (!apiKey?.trim() || !model?.trim()) return null;

  const system = [
    "Você classifica perguntas sobre um board Kanban em JSON estruturado.",
    "Responda SOMENTE com JSON válido, sem markdown.",
    "",
    "Schema de saída (escolha um):",
    '1) {"kind":"card_filter","filter": <ast>}',
    '2) {"kind":"metric","metric":{"metric":"throughput","timeRange":"last_calendar_week"|"this_calendar_week"|"previous_calendar_week","compare":null|"previous_calendar_week"}}',
    '3) {"kind":"unparseable"}',
    "",
    "AST de filtro:",
    '- Folha: {"field":"priority"|"progress"|"bucket"|"columnEnteredAt"|"ownerPresent"|"dueDate","operator":"eq"|"ne"|"in"|"older_than"|"newer_than"|"is_true"|"is_false","value":"..." }',
    "- ownerPresent is_false = sem dono (sem owner/assignee).",
    '- columnEnteredAt older_than usa value tipo "5 days" (dias).',
    '- Composição: {"and":[...]} ou {"or":[...]}',
    "",
    `Colunas conhecidas (chave e rótulo): ${JSON.stringify(bucketHints)}`,
    "",
    `Pergunta: ${query.trim()}`,
  ].join("\n");

  const res = await callTogetherApi(
    {
      model: model.trim(),
      temperature: 0.1,
      max_tokens: 400,
      messages: [{ role: "user", content: system }],
    },
    { apiKey: apiKey.trim() }
  );

  if (!res.ok) return null;
  const text = extractTextFromLlmContent(res.assistantText);
  const parsed = safeJsonParse<LlmNlqShape>(text);
  if (!parsed || typeof parsed !== "object") return null;
  return planFromLlmJson(parsed);
}

export function executeNlqPlan(args: {
  board: BoardData;
  plan: NlqPlan;
  copilotChats: CopilotChatDocLike[];
}): NlqApiResponse {
  const { board, plan, copilotChats } = args;

  if (plan.kind === "unparseable") {
    return fallbackUnparseable();
  }

  if (plan.kind === "card_filter") {
    const rows = filterBoardCardsByNlq(board, plan.filter);
    const explanation =
      rows.length === 0
        ? "Nenhum card encontrado com esses critérios."
        : `Encontrados ${rows.length} card(s) que correspondem à consulta.`;
    return {
      ok: true,
      resultType: "cards",
      cardIds: rows.map((r) => r.id),
      rows,
      explanation,
    };
  }

  if (plan.kind === "metric") {
    const m = buildNlqThroughputMetric({
      chats: copilotChats,
      boardId: board.id,
      spec: plan.metric,
    });
    return {
      ok: true,
      resultType: "metric",
      metric: "throughput",
      primaryValue: m.primaryValue,
      compareValue: m.compareValue,
      chart: m.chart,
      explanation: m.explanation,
    };
  }

  return fallbackUnparseable();
}
