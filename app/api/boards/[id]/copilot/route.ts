import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { runOrgLlmChat, type OrgLlmChatResult } from "@/lib/llm-org-chat";
import { isTogetherApiConfigured, resolveInteractiveLlmRoute } from "@/lib/org-ai-routing";
import type { Organization } from "@/lib/kv-organizations";
import { getBoard, updateBoardFromExisting, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";
import { appendBoardCopilotMessages, getBoardCopilotChat, type CopilotMessageRole } from "@/lib/kv-board-copilot";
import { retrieveRelevantDocChunksWithDebug } from "@/lib/docs-rag";
import { buildCopilotWorldSnapshot } from "@/lib/copilot-world-snapshot";
import { nextBoardCardId } from "@/lib/card-id";

export const runtime = "nodejs";

type CopilotChatInput = {
  message: string;
  /** Quando true, envia evento SSE `rag_debug` com scores e método de retrieval. */
  debug?: boolean;
};

type CopilotToolName = "moveCard" | "updatePriority" | "createCard" | "generateBrief";

type CopilotAction = {
  tool: CopilotToolName;
  args: Record<string, unknown>;
};

type CopilotModelOutput = {
  reply: string;
  actions?: CopilotAction[];
  /** Metadados para UI (modelo / modo). */
  llm?: { model?: string; provider?: string; source: "cloud" | "heuristic" };
};

const PRIORITIES = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;
const DIRECTIONS = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"] as const;

const FREE_DEMO_MESSAGES_LIMIT = 3;
const MAX_MODEL_CONTEXT_CARDS = 40;
const MAX_MODEL_CONTEXT_DAILIES = 5;

function toLocalIsoDate(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

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

function sanitizeJsonCandidate(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractFirstBalancedJsonObject(value: string): string | null {
  const input = String(value || "");
  const start = input.indexOf("{");
  if (start < 0) return null;

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1).trim();
    }
  }

  return null;
}

function parseJsonFromLlmContent(raw: string): { parsed: unknown; recovered: boolean } {
  const direct = String(raw || "").trim();
  if (!direct) return { parsed: {}, recovered: true };

  const tryParse = (s: string): { parsed: unknown; recovered: boolean } => {
    try {
      return { parsed: JSON.parse(s), recovered: false };
    } catch {
      return { parsed: {}, recovered: true };
    }
  };

  try {
    return { parsed: JSON.parse(direct), recovered: false };
  } catch {
    // continue
  }

  const sanitized = sanitizeJsonCandidate(direct);
  try {
    return { parsed: JSON.parse(sanitized), recovered: true };
  } catch {
    // continue
  }

  const balanced = extractFirstBalancedJsonObject(raw);
  if (balanced) {
    const s = sanitizeJsonCandidate(balanced);
    try {
      return { parsed: JSON.parse(s), recovered: true };
    } catch {
      // continue
    }
  }

  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (m?.[0]) {
    const s = sanitizeJsonCandidate(m[0]);
    try {
      return { parsed: JSON.parse(s), recovered: true };
    } catch {
      // continue
    }
  }

  return tryParse(direct);
}

function prioritySafe(v: unknown): (typeof PRIORITIES)[number] | null {
  const s = String(v || "").trim();
  if ((PRIORITIES as readonly string[]).includes(s)) return s as any;
  return null;
}

function progressSafe(v: unknown): (typeof PROGRESSES)[number] | null {
  const s = String(v || "").trim();
  if ((PROGRESSES as readonly string[]).includes(s)) return s as any;
  return null;
}

function directionSafe(v: unknown): (typeof DIRECTIONS)[number] | null {
  const s = String(v || "").trim();
  if ((DIRECTIONS as readonly string[]).includes(s)) return s as any;
  if (!s) return null;
  return null;
}

function resolveBucketKey(board: any, bucketKeyOrLabel?: string, bucketLabelOrKey?: string): string | null {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const list = bucketOrder
    .filter((b: any) => b && typeof b === "object")
    .map((b: any) => ({ key: String(b.key || ""), label: String(b.label || "") }))
    .filter((b: any) => b.key);

  if (list.length === 0) return null;

  const byKey = list.find((b: any) => b.key.toLowerCase() === String(bucketKeyOrLabel || "").trim().toLowerCase());
  if (byKey) return byKey.key;

  const byLabel = list.find((b: any) => b.label.toLowerCase() === String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase());
  if (byLabel) return byLabel.key;

  const raw = String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase();
  if (!raw) return null;

  const labelIncludes = list.find((b: any) => b.label.toLowerCase().includes(raw));
  if (labelIncludes) return labelIncludes.key;

  const keyIncludes = list.find((b: any) => b.key.toLowerCase().includes(raw));
  if (keyIncludes) return keyIncludes.key;

  if (raw.length >= 2) {
    const rawIncludesLabel = list.find(
      (b: any) => b.label.toLowerCase().length >= 2 && raw.includes(b.label.toLowerCase())
    );
    if (rawIncludesLabel) return rawIncludesLabel.key;

    const rawIncludesKey = list.find((b: any) => b.key.toLowerCase().length >= 2 && raw.includes(b.key.toLowerCase()));
    if (rawIncludesKey) return rawIncludesKey.key;
  }

  return null;
}

/** Campos que o modelo costuma usar em vez de bucketKey/bucketLabel. */
const BUCKET_TOOL_ARG_ALIASES = [
  "bucketKey",
  "bucketLabel",
  "bucket",
  "column",
  "coluna",
  "targetBucket",
  "columnKey",
  "columnLabel",
  "para",
  "destino",
] as const;

function firstBucketKey(board: any): string | null {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const first = bucketOrder.find((b: any) => b && String(b.key || "").trim());
  return first ? String(first.key) : null;
}

function resolveBucketKeyFromToolArgs(board: any, args: Record<string, unknown>): string | null {
  const bk = args.bucketKey != null ? String(args.bucketKey).trim() : "";
  const bl = args.bucketLabel != null ? String(args.bucketLabel).trim() : "";
  const fromPair = resolveBucketKey(board, bk || undefined, bl || undefined);
  if (fromPair) return fromPair;

  for (const key of BUCKET_TOOL_ARG_ALIASES) {
    const v = args[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const resolved = resolveBucketKey(board, s, s);
    if (resolved) return resolved;
  }
  return null;
}

function resolveCardId(cards: any[], cardIdOrTitle: string): string | null {
  const raw = String(cardIdOrTitle || "").trim();
  if (!raw) return null;
  const exact = cards.find((c: any) => String(c?.id || "") === raw);
  if (exact?.id) return String(exact.id);

  const nt = normalizeTitle(raw);
  if (!nt) return null;
  const byTitle = cards.filter((c: any) => normalizeTitle(String(c?.title || "")) === nt);
  if (byTitle.length === 1) return String(byTitle[0].id);
  return null;
}

function cardsSortedByBucket(cards: any[], bucketOrderKeys: string[]): any[] {
  const bucketKeys = Array.from(new Set([...bucketOrderKeys, ...cards.map((c) => String(c.bucket || ""))])).filter(Boolean);
  const next: any[] = [];
  for (const bk of bucketKeys) {
    const bucketCards = cards
      .filter((c) => String(c.bucket || "") === bk)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    bucketCards.forEach((c, i) => (c.order = i));
    next.push(...bucketCards);
  }
  return next;
}

function buildCopilotContext(board: any): {
  bucketLabels: Array<{ key: string; label: string }>;
  cards: any[];
  portfolio: ReturnType<typeof computeBoardPortfolio>;
  executionInsights: {
    inProgress: number;
    overdue: number;
    dueSoon: number;
    doneRate: number;
    urgent: number;
    nextActions: any[];
    wipRiskColumns: any[];
  };
  latestDailies: any[];
  activityHints: any[];
} {
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const bucketLabels = bucketOrder
    .filter((b: any) => b && typeof b === "object")
    .map((b: any) => ({ key: String(b.key || ""), label: String(b.label || "") }))
    .filter((b: any) => b.key && b.label);

  const cards = (Array.isArray(board?.cards) ? board.cards : []).map((c: any, idx: number) => ({
    id: String(c.id || "").trim() || `card_${idx}`,
    bucket: String(c.bucket || "").trim(),
    priority: String(c.priority || "").trim(),
    progress: String(c.progress || "").trim(),
    title: String(c.title || "").trim(),
    desc: String(c.desc || ""),
    tags: Array.isArray(c.tags) ? c.tags.map((t: any) => String(t || "").trim()).filter(Boolean) : [],
    direction: c.direction == null ? null : String(c.direction),
    dueDate: c.dueDate == null ? null : String(c.dueDate),
    order: typeof c.order === "number" && Number.isFinite(c.order) ? c.order : idx,
  }));

  const portfolio = computeBoardPortfolio(board);

  const bucketOrderKeys = bucketOrder.map((b: any) => String(b.key || "")).filter(Boolean);

  const open = cards.filter((c: any) => c.progress !== "Concluída");
  const inProgress = cards.filter((c: any) => c.progress === "Em andamento").length;
  const done = cards.filter((c: any) => c.progress === "Concluída").length;
  const urgent = cards.filter((c: any) => c.priority === "Urgente").length;
  const overdue = open.filter((c: any) => {
    const d = daysUntilDue(c.dueDate);
    return d !== null && d < 0;
  }).length;
  const dueSoon = open.filter((c: any) => {
    const d = daysUntilDue(c.dueDate);
    return d !== null && d >= 0 && d <= 3;
  }).length;
  const doneRate = cards.length ? Math.round((done / cards.length) * 100) : 0;

  const priorityWeight: Record<string, number> = { Urgente: 4, Importante: 2, "Média": 1 };
  const progressWeight: Record<string, number> = { "Não iniciado": 2, "Em andamento": 3, "Concluída": 0 };
  const now = Date.now();

  const nextActions = [...cards]
    .filter((c: any) => c.progress !== "Concluída")
    .map((c: any) => {
      const due = daysUntilDue(c.dueDate);
      const dueScore = due === null ? 0 : due < 0 ? 5 : due <= 2 ? 4 : due <= 5 ? 2 : 1;
      const score =
        (priorityWeight[c.priority] ?? 1) +
        (progressWeight[c.progress] ?? 1) +
        dueScore +
        (String(c.direction || "").toLowerCase() === "priorizar" ? 2 : 0);
      return { card: c, score, due };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 3);

  const wipRiskColumns = bucketLabels
    .map((b: any) => {
      const count = cards.filter((c: any) => c.bucket === b.key && c.progress === "Em andamento").length;
      return { key: b.key, label: b.label, count };
    })
    .filter((entry: any) => entry.count >= 4)
    .sort((a: any, b: any) => b.count - a.count);

  // Última vez em que o card foi "mencionado" no histórico de dailies (por título).
  const dailyInsights = Array.isArray(board?.dailyInsights) ? board.dailyInsights : [];
  const dailySortedDesc = [...dailyInsights].sort((a: any, b: any) => {
    const ta = new Date(a?.createdAt || 0).getTime();
    const tb = new Date(b?.createdAt || 0).getTime();
    return tb - ta;
  });

  const lastMentionByTitle = new Map<string, number>();
  for (const entry of dailySortedDesc.slice(0, 30)) {
    const createdAtIso = entry?.createdAt;
    const ts = createdAtIso ? new Date(createdAtIso).getTime() : NaN;
    if (!Number.isFinite(ts)) continue;
    const insight = entry?.insight as any;
    const mentioned: string[] = [];

    if (Array.isArray(insight?.criar)) mentioned.push(...insight.criar.map((x: any) => String(x || "")));
    if (Array.isArray(insight?.criarDetalhes)) {
      mentioned.push(...insight.criarDetalhes.map((x: any) => String(x?.titulo || x?.title || "")));
    }

    for (const k of ["ajustar", "corrigir", "pendencias"]) {
      const list = insight?.[k];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === "string") mentioned.push(item);
        else if (item && typeof item === "object") {
          mentioned.push(String((item as any)?.titulo || (item as any)?.title || ""));
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
    const lt = new Date(board?.lastUpdated || 0).getTime();
    const ct = new Date(board?.createdAt || 0).getTime();
    const t = Number.isFinite(lt) ? lt : Number.isFinite(ct) ? ct : null;
    return t ?? null;
  })();

  const activityHints = cards.map((c: any) => {
    const nt = normalizeTitle(c.title);
    const ts = lastMentionByTitle.get(nt);
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
    };
  });

  const latestDailies = dailySortedDesc.slice(0, MAX_MODEL_CONTEXT_DAILIES).map((e: any) => ({
    id: String(e?.id || ""),
    createdAt: e?.createdAt ? String(e.createdAt) : undefined,
    transcriptSnippet: e?.transcript ? String(e.transcript).slice(0, 400) : undefined,
    resumo: e?.insight?.resumo ? String(e.insight.resumo).slice(0, 600) : undefined,
    createdCards: Array.isArray(e?.createdCards)
      ? e.createdCards.slice(0, 12).map((cc: any) => ({
          title: String(cc?.title || ""),
          bucket: String(cc?.bucket || ""),
          priority: String(cc?.priority || ""),
          progress: String(cc?.progress || ""),
        }))
      : undefined,
  }));

  return {
    bucketLabels,
    cards,
    portfolio,
    executionInsights: {
      inProgress,
      overdue,
      dueSoon,
      doneRate,
      urgent,
      nextActions,
      wipRiskColumns,
    },
    latestDailies,
    activityHints,
  };
}

function heuristicWeeklyBrief(board: any): string {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const daily = Array.isArray(board?.dailyInsights) ? board.dailyInsights : [];
  const recent = daily
    .filter((d: any) => {
      const ts = d?.createdAt ? new Date(d.createdAt).getTime() : NaN;
      return Number.isFinite(ts) && ts >= weekAgo;
    })
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 7);

  const { portfolio, executionInsights } = buildCopilotContext(board);
  const lines: string[] = [];
  lines.push(`# Brief semanal — Flux-Board`);
  lines.push(``);
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  if (board?.name) lines.push(`- Board: ${board.name}`);
  lines.push(``);
  lines.push(`## Métricas (heurísticas)`);
  lines.push(`- Risco: ${portfolio.risco ?? "—"}`);
  lines.push(`- Throughput: ${portfolio.throughput ?? "—"}`);
  lines.push(`- Previsibilidade: ${portfolio.previsibilidade ?? "—"}`);
  lines.push(`- Em andamento: ${executionInsights.inProgress}`);
  lines.push(`- Overdue: ${executionInsights.overdue}`);
  lines.push(`- Due em até 3 dias: ${executionInsights.dueSoon}`);
  lines.push(`- Taxa de concluídas: ${executionInsights.doneRate}%`);
  lines.push(``);

  lines.push(`## Dailies da semana (resumo)`);
  if (!recent.length) {
    lines.push(`- Sem dailies na janela de 7 dias.`);
    lines.push(``);
  } else {
    for (const e of recent) {
      const dt = e?.createdAt ? new Date(e.createdAt).toLocaleDateString("pt-BR") : "";
      const resumo = e?.insight?.resumo ? String(e.insight.resumo).trim() : "";
      lines.push(`- ${dt}: ${resumo ? resumo : "Sem resumo disponível."}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

function copilotHeuristicWhenNoLlm(input: {
  board: any;
  userMessage: string;
}): CopilotModelOutput {
  const ctx = buildCopilotContext(input.board);
  const s = String(input.userMessage || "").toLowerCase();

  if (s.includes("parad") && (s.includes("5") || s.includes("mais de"))) {
    const stuck = ctx.activityHints
      .filter((h: any) => h.daysSinceMentioned > 5 && h.progress !== "Concluída")
      .sort((a: any, b: any) => b.daysSinceMentioned - a.daysSinceMentioned)
      .slice(0, 12);

    const lines: string[] = [];
    lines.push(`# Cards possivelmente parados (> 5 dias)`);
    if (!stuck.length) {
      lines.push(`- Não encontrei cards com indicação de estagnação pelo histórico de dailies.`);
    } else {
      for (const h of stuck) {
        const bucketKey = String(h.bucket || "");
        lines.push(`- ${h.title} (id: ${h.cardId}) • ${bucketKey} • ${h.daysSinceMentioned} dia(s) desde última menção`);
      }
    }
    return {
      reply: lines.join("\n"),
      actions: [],
      llm: { source: "heuristic", model: "Heurístico local" },
    };
  }

  if (/(resuma|brief|diret(or|oria)|semana)/i.test(s)) {
    return {
      reply: heuristicWeeklyBrief(input.board),
      actions: [],
      llm: { source: "heuristic", model: "Heurístico local" },
    };
  }

  return {
    reply:
      "Modo sem IA cloud habilitada (configure TOGETHER_API_KEY/TOGETHER_MODEL e/ou ANTHROPIC_API_KEY). Posso responder por heurística: cards parados por dailies e brief semanal.",
    actions: [],
    llm: { source: "heuristic", model: "Heurístico local" },
  };
}

function anthropicSnippetIsInsufficientCredits(snippet: string): boolean {
  const s = snippet.toLowerCase();
  return (
    s.includes("credit balance") ||
    s.includes("too low to access") ||
    s.includes("purchase credits") ||
    s.includes("plans & billing")
  );
}

/** Mensagem ao usuário + log em servidor (Vercel) com corpo da API quando falha. */
function copilotLlmFailureReply(failed: Extract<OrgLlmChatResult, { ok: false }>): string {
  const err = failed.error || "";
  const status = failed.status;
  const snippet = failed.bodySnippet?.slice(0, 600) ?? "";

  console.error("[copilot] LLM call failed", {
    resolvedRoute: failed.resolvedRoute,
    provider: failed.provider,
    error: err,
    status,
    bodySnippet: snippet,
  });

  if (failed.resolvedRoute === "anthropic") {
    if (err === "no_api_key") {
      return "ANTHROPIC_API_KEY não está disponível neste deploy. Confira variáveis de ambiente no Vercel (Production vs Preview).";
    }
    if (err.startsWith("http_")) {
      const code = Number(err.slice(5));
      if (code === 401) {
        return "A API Anthropic recusou a chave (401). Verifique se ANTHROPIC_API_KEY está correta, sem espaços extras, e ligada ao ambiente que você usa (Production/Preview/Development).";
      }
      if (code === 403) {
        return "Acesso negado pela Anthropic (403). Confira permissões da chave, região e faturamento da conta.";
      }
      if (code === 400 || code === 404) {
        if (anthropicSnippetIsInsufficientCredits(snippet)) {
          return "Saldo de créditos da conta Anthropic insuficiente. Em https://console.anthropic.com acesse Plans & Billing para comprar créditos ou ativar um plano. O erro 400 neste caso não é ID do modelo.";
        }
        const hint = snippet ? ` (${snippet.slice(0, 220)}${snippet.length > 220 ? "…" : ""})` : "";
        return `Pedido rejeitado pela Anthropic (${code}). Use o ID exato do modelo na API (Configurações da organização ou ANTHROPIC_MODEL no Vercel).${hint}`;
      }
      if (code === 429) {
        return "Limite de uso da API Anthropic (429). Aguarde e tente de novo.";
      }
      if (code === 503 || code === 529) {
        return "Serviço Anthropic sobrecarregado ou indisponível. Tente novamente em instantes.";
      }
    }
    if (err === "network_error" || err.includes("fetch")) {
      return "Falha de rede ao contactar a API Anthropic. Tente de novo ou confira firewall/DNS no ambiente de deploy.";
    }
  }

  if (failed.resolvedRoute === "together") {
    if (err === "no_api_key") {
      return "TOGETHER_API_KEY não configurada neste deploy.";
    }
    if (err.startsWith("http_")) {
      const code = Number(err.slice(5));
      if (code === 401) {
        return "A API Together recusou a chave (401). Verifique TOGETHER_API_KEY no Vercel.";
      }
      if (code === 429) {
        return "Limite de uso da API Together (429). Tente novamente em instantes.";
      }
    }
  }

  if (failed.error === "missing_user") {
    return "Sessão inválida para chamar o modelo.";
  }

  return `Falha ao chamar o modelo (${err || "erro desconhecido"}). Tente novamente em instantes.`;
}

async function callCopilotLlmModel(input: {
  org: Organization;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  board: any;
  boardName: string;
  userMessage: string;
  historyMessages: Array<{ role: CopilotMessageRole; content: string }>;
  tier: ReturnType<typeof getEffectiveTier>;
  worldSnapshot: string;
}): Promise<CopilotModelOutput> {
  const routePick = resolveInteractiveLlmRoute(input.org, { userId: input.userId, isAdmin: input.isAdmin });
  if (routePick.route === "together" && !isTogetherApiConfigured()) {
    return copilotHeuristicWhenNoLlm({ board: input.board, userMessage: input.userMessage });
  }

  const providerLabel = (p: string) => (p === "anthropic" ? "Anthropic" : "Together");

  const ctx = buildCopilotContext(input.board);
  const cardsForPrompt = ctx.cards.slice(0, MAX_MODEL_CONTEXT_CARDS);
  const histForPrompt = input.historyMessages.slice(-8);

  const system = [
    "Você é um Copiloto de operações (Flux-Board): entende o board atual, OKRs da org, automações, documentos (RAG) e métricas de portfólio/relatórios.",
    "Use o `worldSnapshot` como visão agregada da organização; use o JSON do board abaixo para detalhes e IDs dos cards deste quadro.",
    "Priorize coerência entre OKRs, boards e docs quando a pergunta for estratégica ou cross-funcional.",
    "",
    "Regras obrigatórias:",
    "1) Responda SOMENTE com JSON puro, sem markdown, sem texto fora do JSON.",
    "2) O JSON DEVE ter as chaves: `reply` (string) e `actions` (array; pode ser vazio).",
    "3) `actions` só deve ser preenchido quando o usuário pedir explicitamente mudanças no board, como: mover card, ajustar prioridade, criar card.",
    "4) Para perguntas/sugestões (ex.: 'Quais cards estão parados...?', 'Resuma...', 'Sugira prioridades...'), normalmente `actions` deve ser vazio.",
    "5) Quando o usuário pedir um resumo/brief para diretoria, você pode usar tool `generateBrief` (não altera o board).",
    "",
    "Schema de ferramentas (tool-use):",
    "- moveCard: { tool: 'moveCard', args: { cardId: string, bucketKey?: string, bucketLabel?: string, bucket?: string, column?: string, targetIndex?: number, setProgress?: 'Não iniciado'|'Em andamento'|'Concluída' } } — para a coluna de destino use bucketKey OU bucketLabel igual a um item de `bucketOrder` (key ou label); `bucket`/`column` são sinônimos aceitos.",
    "- updatePriority: { tool: 'updatePriority', args: { cardId: string, priority: 'Urgente'|'Importante'|'Média' } }",
    "- createCard: { tool: 'createCard', args: { bucketKey?: string, bucketLabel?: string, bucket?: string, column?: string, title: string, desc?: string, tags?: string[], priority: 'Urgente'|'Importante'|'Média', progress: 'Não iniciado'|'Em andamento'|'Concluída', direction?: string|null, dueDate?: string|null } } — se não informar coluna, use bucketKey/bucketLabel da primeira coluna em `bucketOrder`.",
    "- generateBrief: { tool: 'generateBrief', args: { scope?: string } }",
    "",
    "Valores válidos (use exatamente):",
    `prioridades=${JSON.stringify(PRIORITIES)}`,
    `progresso=${JSON.stringify(PROGRESSES)}`,
    `direções=${JSON.stringify(DIRECTIONS)}`,
    "",
    "Contexto do board (para inferências e validação de IDs):",
    `boardName=${input.boardName}`,
    `portfolioMetrics=${JSON.stringify(ctx.portfolio)}`,
    `executionInsights=${JSON.stringify(ctx.executionInsights)}`,
    `bucketOrder=${JSON.stringify(ctx.bucketLabels)}`,
    `cards=${JSON.stringify(cardsForPrompt)}`,
    `activityHints=${JSON.stringify(ctx.activityHints.slice(0, 25))}`,
    `latestDailies=${JSON.stringify(ctx.latestDailies)}`,
    `worldSnapshot=${input.worldSnapshot}`,
    "",
    "Histórico do chat (para manter contexto; pode ignorar se não ajudar):",
    ...(histForPrompt.map((m) => `${m.role}: ${m.content.slice(0, 1500)}`) || []),
    "",
    `Mensagem do usuário: ${input.userMessage}`,
    "",
    "Saída esperada: JSON { reply: string, actions: Array }",
  ].join("\n");

  const promptMessages = [{ role: "user" as const, content: system }];

  const res = await runOrgLlmChat({
    org: input.org,
    orgId: input.orgId,
    feature: "board_copilot",
    messages: promptMessages,
    options: { temperature: 0.2 },
    mode: "interactive",
    userId: input.userId,
    isAdmin: input.isAdmin,
  });

  if (!res.ok) {
    const modelHint =
      res.resolvedRoute === "anthropic"
        ? routePick.anthropicModel
        : process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    return {
      reply: copilotLlmFailureReply(res),
      actions: [],
      llm: {
        source: "cloud",
        model: modelHint,
        provider: providerLabel(res.resolvedRoute === "anthropic" ? "anthropic" : "together"),
      },
    };
  }

  const content = res.assistantText || "";
  const parsed = parseJsonFromLlmContent(content);

  const obj = parsed.parsed && typeof parsed.parsed === "object" ? (parsed.parsed as any) : null;
  const reply = String(obj?.reply || "").trim();
  const actions = Array.isArray(obj?.actions) ? obj.actions : [];

  return {
    reply: reply || "Não foi possível gerar uma resposta estruturada. Tente reformular a pergunta.",
    actions: actions
      .filter((a: any) => a && typeof a === "object" && typeof a.tool === "string")
      .map((a: any) => ({ tool: a.tool as CopilotToolName, args: (a.args && typeof a.args === "object" ? a.args : {}) as any })),
    llm: {
      source: "cloud",
      model: res.model,
      provider: providerLabel(res.provider),
    },
  };
}

function shouldUseActionsFromUserMessage(userMessage: string): boolean {
  const s = String(userMessage || "").toLowerCase();
  // heurística simples: consideramos "mover/ajustar/criar" como pedidos de alteração
  return /(mover|mova|ajustar|ajuste|prioridade|criar|novo card|crie|atualizar card)/i.test(s);
}

async function executeCopilotActions(params: {
  board: any;
  actions: CopilotAction[];
  userMessage: string;
}): Promise<{
  updatedCards?: any[];
  toolResults: Array<{ tool: CopilotToolName; ok: boolean; message: string; data?: any }>;
}> {
  const { board, actions, userMessage } = params;
  let cards = Array.isArray(board?.cards) ? [...board.cards] : [];
  const bucketOrder = Array.isArray(board?.config?.bucketOrder) ? board.config.bucketOrder : [];
  const bucketOrderKeys = bucketOrder.map((b: any) => String(b.key || "")).filter(Boolean);

  const toolResults: Array<{ tool: CopilotToolName; ok: boolean; message: string; data?: any }> = [];

  // Segurança: mesmo se o modelo listar actions, só executamos se a mensagem indicar intenção.
  const allowMutations = shouldUseActionsFromUserMessage(userMessage);

  for (const action of actions) {
    const tool = action.tool;
    const args = action.args || {};

    try {
      if (tool === "moveCard") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const cardIdRaw = String(args.cardId || "").trim();
        const cardId = resolveCardId(cards, cardIdRaw);
        if (!cardId) throw new Error("cardId/card title inválido ou não encontrado.");
        const cardIdx = cards.findIndex((c: any) => String(c.id) === cardId);
        if (cardIdx < 0) throw new Error(`Card não encontrado: ${cardId}`);

        const bucketKey = resolveBucketKeyFromToolArgs(board, args);
        if (!bucketKey) throw new Error("bucketKey/bucketLabel inválido ou ausente.");

        const targetIndexRaw = args.targetIndex;
        const bucketCards = cards
          .filter((c: any) => String(c.bucket || "") === bucketKey && String(c.id) !== cardId)
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        const targetIndex = typeof targetIndexRaw === "number" ? clamp(targetIndexRaw, 0, bucketCards.length) : bucketCards.length;

        const setProgress = args.setProgress ? progressSafe(args.setProgress) : null;

        const card = { ...cards[cardIdx], bucket: bucketKey };
        if (setProgress) card.progress = setProgress;

        // Remove e reinsere.
        const without = cards.filter((c: any) => String(c.id) !== cardId);
        const existingTarget = without
          .filter((c: any) => String(c.bucket || "") === bucketKey)
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        existingTarget.splice(targetIndex, 0, card);
        existingTarget.forEach((c: any, i: number) => (c.order = i));

        // Recria ordem por bucket.
        const otherBuckets = without.filter((c: any) => String(c.bucket || "") !== bucketKey);
        cards = cardsSortedByBucket([...otherBuckets, ...existingTarget], bucketOrderKeys);

        toolResults.push({
          tool,
          ok: true,
          message: `Movido card ${cardId} para ${bucketKey}.`,
          data: {
            cardId,
            bucketKey,
            // Usamos isso para contabilizar "concluídos" no weekly digest quando o usuário pediu explicitamente
            // mudar o progresso para "Concluída".
            setProgress: setProgress ?? undefined,
          },
        });
        continue;
      }

      if (tool === "updatePriority") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const cardIdRaw = String(args.cardId || "").trim();
        const cardId = resolveCardId(cards, cardIdRaw);
        const prio = prioritySafe(args.priority);
        if (!cardId) throw new Error("cardId/card title inválido ou não encontrado.");
        if (!prio) throw new Error("priority inválida.");

        const next = cards.map((c: any) => (String(c.id) === cardId ? { ...c, priority: prio } : c));
        const changed = JSON.stringify(next) !== JSON.stringify(cards);
        cards = next;
        toolResults.push({
          tool,
          ok: true,
          message: `Prioridade do card ${cardId} ajustada para ${prio}.`,
          data: { cardId, priority: prio },
        });
        continue;
      }

      if (tool === "createCard") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const title = String(args.title || "").trim();
        if (!title) throw new Error("title obrigatório para createCard.");

        let bucketKey = resolveBucketKeyFromToolArgs(board, args);
        if (!bucketKey) bucketKey = firstBucketKey(board);
        if (!bucketKey) throw new Error("bucketKey/bucketLabel inválido ou ausente (e não há colunas no board).");

        const prio = prioritySafe(args.priority) || "Média";
        const prog = progressSafe(args.progress) || "Não iniciado";
        const desc = args.desc != null ? String(args.desc) : "";
        const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 30) : [];
        const dir = args.direction === null || args.direction === undefined ? null : directionSafe(args.direction) ?? null;
        const dueDate = args.dueDate === null || args.dueDate === undefined ? null : toLocalIsoDate(String(args.dueDate)) ?? null;

        const id = nextBoardCardId(cards.map((c: any) => String(c.id)));

        const bucketCards = cards
          .filter((c: any) => String(c.bucket || "") === bucketKey)
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        const order = bucketCards.length;

        const newCard = {
          id,
          bucket: bucketKey,
          priority: prio,
          progress: prog,
          title,
          desc,
          tags,
          direction: dir,
          dueDate,
          order,
        };

        cards = cardsSortedByBucket([...cards, newCard], bucketOrderKeys);
        toolResults.push({
          tool,
          ok: true,
          message: `Card criado: ${title}`,
          data: { cardId: id, progress: prog },
        });
        continue;
      }

      if (tool === "generateBrief") {
        const brief = heuristicWeeklyBrief(board);
        toolResults.push({ tool, ok: true, message: "Brief gerado.", data: { brief } });
        continue;
      }

      toolResults.push({ tool, ok: false, message: "Tool desconhecida." });
    } catch (err) {
      toolResults.push({
        tool: action.tool,
        ok: false,
        message: err instanceof Error ? err.message : "Erro ao executar tool.",
      });
    }
  }

  return {
    updatedCards: cards,
    toolResults,
  };
}

function formatAssistantReply(params: {
  reply: string;
  toolResults: Array<{ tool: CopilotToolName; ok: boolean; message: string; data?: any }>;
}): string {
  const { reply, toolResults } = params;

  const brief = toolResults.find((r) => r.ok && r.tool === "generateBrief")?.data?.brief;
  const appliedMutations = toolResults.filter((r) => r.ok && (r.tool === "moveCard" || r.tool === "updatePriority" || r.tool === "createCard"));

  const parts: string[] = [];
  parts.push(reply.trim());

  if (brief && typeof brief === "string" && brief.trim()) {
    parts.push("");
    parts.push("## Brief para diretoria");
    parts.push(brief.trim());
  }

  if (appliedMutations.length) {
    parts.push("");
    parts.push("## Ações aplicadas");
    for (const r of appliedMutations) parts.push(`- ${r.message}`);
  }

  return parts.join("\n");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxForAuth(payload.isAdmin);

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const tier = getEffectiveTier(org, gateCtx);
  const chat = await getBoardCopilotChat({ orgId: payload.orgId, boardId, userId: payload.id });
  const freeRemaining = tier === "free" ? Math.max(0, FREE_DEMO_MESSAGES_LIMIT - chat.freeDemoUsed) : null;

  return NextResponse.json({
    tier,
    freeDemoRemaining: freeRemaining,
    messages: chat.messages.slice(-60),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<CopilotChatInput>;
  const debugRag = Boolean(body.debug);
  const rawMsg = sanitizeText(body.message).trim();
  const guarded = guardUserPromptForLlm(rawMsg);
  const userMessage = guarded.text;
  if (!userMessage) {
    return NextResponse.json({ error: "Mensagem é obrigatória." }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxForAuth(payload.isAdmin);

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const tier = getEffectiveTier(org, gateCtx);
  const copilotFeatureAllowed = canUseFeature(org, "board_copilot", gateCtx);

  // Pro/Business: bloqueio por feature gate.
  if (tier !== "free") {
    if (!copilotFeatureAllowed) {
      return NextResponse.json({ error: "Recurso disponível apenas para Pro/Business." }, { status: 403 });
    }
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  // Free demo limit (3 mensagens no total do chat).
  const chat = await getBoardCopilotChat({ orgId: payload.orgId, boardId, userId: payload.id });
  if (tier === "free" && chat.freeDemoUsed >= FREE_DEMO_MESSAGES_LIMIT) {
    return NextResponse.json(
      { error: "Modo demo atingiu o limite. Faça upgrade para Pro/Business para continuar." },
      { status: 403 }
    );
  }

  // Rate limit do endpoint.
  const rl = await rateLimit({
    key: `boards:copilot:user:${payload.id}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const llmCloudEnabled =
    (Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL)) ||
    Boolean(process.env.ANTHROPIC_API_KEY);
  if (tier === "free" && llmCloudEnabled) {
    const cap = getDailyAiCallsCap(org, gateCtx);
    if (cap !== null) {
      const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
      const rlDaily = await rateLimit({
        key: dailyKey,
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return NextResponse.json(
          { error: "Limite diário de chamadas de IA atingido. Faça upgrade no Stripe." },
          { status: 403 }
        );
      }
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("status", { phase: "started" });

        const historyMessages = chat.messages
          .slice(-12)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as CopilotMessageRole, content: m.content }));

        const ragResult = await retrieveRelevantDocChunksWithDebug(payload.orgId, userMessage, 12);
        const ragChunks = ragResult.chunks;
        if (debugRag) {
          sendEvent("rag_debug", ragResult.debug);
        }
        const { snapshot: worldSnapshot, ragChunksUsed } = await buildCopilotWorldSnapshot({
          orgId: payload.orgId,
          userId: payload.id,
          isAdmin: payload.isAdmin,
          boardId,
          board,
          userMessage,
          org,
          ragChunks,
          planGateCtx: gateCtx,
        });

        const modelOutput = await callCopilotLlmModel({
          org,
          orgId: payload.orgId,
          userId: payload.id,
          isAdmin: payload.isAdmin,
          board,
          boardName: String(board.name || "Board"),
          userMessage,
          historyMessages,
          tier,
          worldSnapshot,
        });

        const actions = Array.isArray(modelOutput.actions) ? modelOutput.actions : [];

        // Tool execution uses board state snapshot; updates persist via updateBoardFromExisting.
        let updatedCards: any[] | undefined = undefined;
        const toolResults = await (async () => {
          const exec = await executeCopilotActions({ board, actions, userMessage });
          updatedCards = exec.updatedCards;
          return exec.toolResults;
        })();

        // Só notifica o cliente quando houve mutação real — evita `updateDb`+persist desnecessários a cada mensagem.
        const mutationTools = toolResults.filter((r) => r.ok && (r.tool === "moveCard" || r.tool === "updatePriority" || r.tool === "createCard"));
        if (mutationTools.length && Array.isArray(updatedCards)) {
          const nextBoard = await updateBoardFromExisting(board, { cards: updatedCards }, {
            userId: payload.id,
            userName: payload.username,
            orgId: payload.orgId,
          });
          updatedCards = nextBoard.cards as any[];
          sendEvent("board_update", { cards: updatedCards, lastUpdated: nextBoard.lastUpdated });
        }

        for (const r of toolResults) sendEvent("tool_result", r);

        const finalReply = formatAssistantReply({ reply: modelOutput.reply, toolResults });

        // Persist chat history (user msg + assistant reply).
        const persisted = await appendBoardCopilotMessages({
          orgId: payload.orgId,
          boardId,
          userId: payload.id,
          incrementFreeDemoUsed: tier === "free",
          messagesToAppend: [
            { role: "user", content: userMessage },
            {
              role: "assistant",
              content: finalReply,
              meta: {
                toolResults,
                llmModel: modelOutput.llm?.model,
                llmProvider: modelOutput.llm?.provider,
                llmSource: modelOutput.llm?.source,
                sourceDocIds: [...new Set(ragChunksUsed.map((c) => c.docId))],
                sourceChunkIds: ragChunksUsed.map((c) => c.chunkId),
              },
            },
          ],
        });

        sendEvent("chat_persisted", { ok: true, messageCount: persisted.messages.length });

        sendEvent("llm_meta", {
          model: modelOutput.llm?.model,
          provider: modelOutput.llm?.provider,
          source: modelOutput.llm?.source,
        });

        sendEvent("reply_start", { ok: true });

        const reply = finalReply;
        const step = 24; // chunk size (chars)
        for (let i = 0; i < reply.length; i += step) {
          const chunk = reply.slice(i, i + step);
          sendEvent("assistant_delta", { text: chunk });
          // tiny delay to allow UI to render gradually
          await new Promise((r) => setTimeout(r, 12));
        }

        sendEvent("done", { ok: true });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro interno no Copiloto.";
        sendEvent("error", { message });
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

