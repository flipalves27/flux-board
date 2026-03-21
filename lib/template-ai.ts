import { callTogetherApi, safeJsonParse } from "./llm-utils";
import type { BoardTemplateSnapshot } from "./template-types";

export type AiTemplateDraft = {
  title: string;
  description: string;
  category: string;
  buckets: Array<{ key: string; label: string; color: string }>;
  labelPalette: string[];
  automationIdeas: string[];
  /** Preenchido na última rodada do fluxo conversacional (1 objetivo com KRs). */
  initialOkrs: Array<{ objective: string; keyResults: string[] }>;
};

export type ConversationAnswers = {
  teamType?: string;
  process?: string;
  metrics?: string;
  automation?: string;
};

const CATEGORIES = [
  "sales",
  "operations",
  "projects",
  "hr",
  "marketing",
  "customer_success",
  "support",
  "insurance_warranty",
] as const;

function baseSystemPrompt(includeOkrs: boolean): string {
  const okrsBlock = includeOkrs
    ? `
- initialOkrs: array com exatamente 1 objeto { "objective": string (título do objetivo para o trimestre), "keyResults": array de 2 a 4 strings (KRs mensuráveis alinhados ao processo descrito) }`
    : `
- initialOkrs: sempre [] (array vazio nesta etapa)`;

  return `Você projeta templates de quadro Kanban para times de negócio.
Responda APENAS JSON válido (sem markdown). Campos obrigatórios:
- title: string curta (nome sugerido do board)
- description: 1-3 frases em português sobre o fluxo
- category: uma de ${JSON.stringify(CATEGORIES)}
- buckets: array de 4 a 8 objetos { "key", "label", "color" } onde key e label são strings não vazias (key em snake_case ou slug), color é hex #RRGGBB
- labelPalette: 5 a 20 tags curtas para cards
- automationIdeas: 2 a 5 frases curtas descrevendo automações úteis (alertas, e-mails, escalações — texto livre)${okrsBlock}`;
}

function buildConversationBody(answers: ConversationAnswers, turnIndex: number): string {
  const parts: string[] = [];
  if (answers.teamType?.trim()) parts.push(`1) Tipo de time / área: ${answers.teamType.trim()}`);
  if (answers.process?.trim()) parts.push(`2) Processo e etapas: ${answers.process.trim()}`);
  if (answers.metrics?.trim()) parts.push(`3) Métricas importantes: ${answers.metrics.trim()}`);
  if (turnIndex >= 3) {
    parts.push(`4) Automação desejada: ${answers.automation?.trim() || "nenhuma"}`);
  } else if (answers.automation?.trim()) {
    parts.push(`4) Automação desejada: ${answers.automation.trim()}`);
  }

  const stageHint =
    turnIndex === 0
      ? "Com base só no tipo de time, proponha um pipeline inicial coerente (ainda genérico mas útil)."
      : turnIndex === 1
        ? "Refine colunas e rótulos incorporando o processo descrito."
        : turnIndex === 2
          ? "Ajuste labels e nomes de colunas para refletir as métricas (SLA, volume, qualidade, receita, etc.)."
          : "Versão final: alinhe automações às expectativas do usuário e inclua OKRs iniciais concretos.";

  return [`Contexto do usuário (português):`, ...parts, "", `Instrução: ${stageHint}`].join("\n");
}

function normalizeDraft(
  parsed: Record<string, unknown>,
  options: { requireOkrs: boolean }
): AiTemplateDraft | null {
  const title = String(parsed.title || "Template gerado").trim().slice(0, 200);
  const description = String(parsed.description || "").trim().slice(0, 2000);
  const catRaw = String(parsed.category || "operations").trim();
  const category = CATEGORIES.includes(catRaw as (typeof CATEGORIES)[number]) ? catRaw : "operations";

  const bucketsRaw = Array.isArray(parsed.buckets) ? parsed.buckets : [];
  const buckets = bucketsRaw
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const o = b as Record<string, unknown>;
      const key = String(o.key || "").trim().slice(0, 200);
      const label = String(o.label || o.key || "").trim().slice(0, 200);
      const color = String(o.color || "#6C5CE7").trim();
      if (!key || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return null;
      return { key, label: label || key, color };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 12);

  if (buckets.length < 2) return null;

  const lp = Array.isArray(parsed.labelPalette) ? parsed.labelPalette : [];
  const labelPalette = lp
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 30);

  const ai = Array.isArray(parsed.automationIdeas) ? parsed.automationIdeas : [];
  const automationIdeas = ai.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8);

  let initialOkrs: AiTemplateDraft["initialOkrs"] = [];
  if (options.requireOkrs) {
    const rawOkrs = parsed.initialOkrs;
    if (Array.isArray(rawOkrs)) {
      initialOkrs = rawOkrs
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const o = item as Record<string, unknown>;
          const objective = String(o.objective || "").trim().slice(0, 300);
          const krs = Array.isArray(o.keyResults) ? o.keyResults : [];
          const keyResults = krs
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, 6);
          if (!objective || keyResults.length < 2) return null;
          return { objective, keyResults };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 2);
    }
    if (initialOkrs.length === 0) return null;
  }

  return {
    title,
    description,
    category,
    buckets,
    labelPalette,
    automationIdeas,
    initialOkrs,
  };
}

async function callTogetherForJson(system: string, user: string): Promise<{
  ok: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
}> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) {
    return { ok: false, error: "LLM não configurado (TOGETHER_API_KEY)." };
  }

  const res = await callTogetherApi(
    {
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { apiKey, baseUrl: base }
  );

  if (!res.ok) {
    const t = res.bodySnippet || "";
    return { ok: false, error: `LLM HTTP ${res.status ?? "?"}: ${t.slice(0, 200)}` };
  }

  const raw = res.assistantText;
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Resposta do modelo inválida." };
  }
  return { ok: true, parsed };
}

/** Fluxo conversacional: turnIndex 0..3 — OKRs apenas no turno 3. */
export async function generateTemplateFromConversationTurn(
  answers: ConversationAnswers,
  turnIndex: number
): Promise<{
  ok: boolean;
  draft?: AiTemplateDraft;
  error?: string;
}> {
  if (turnIndex < 0 || turnIndex > 3) {
    return { ok: false, error: "Etapa inválida." };
  }

  const includeOkrs = turnIndex === 3;
  const system = baseSystemPrompt(includeOkrs);
  const user = `${buildConversationBody(answers, turnIndex).slice(0, 8000)}`;

  const res = await callTogetherForJson(system, user);
  if (!res.ok || !res.parsed) return { ok: false, error: res.error };

  const draft = normalizeDraft(res.parsed, { requireOkrs: includeOkrs });
  if (!draft) {
    return { ok: false, error: includeOkrs ? "Modelo não retornou colunas ou OKRs suficientes." : "Modelo não retornou colunas suficientes." };
  }

  if (!includeOkrs) {
    draft.initialOkrs = [];
  }

  return { ok: true, draft };
}

export async function generateTemplateDraftWithTogether(teamDescription: string): Promise<{
  ok: boolean;
  draft?: AiTemplateDraft;
  error?: string;
}> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  if (!apiKey) {
    return { ok: false, error: "LLM não configurado (TOGETHER_API_KEY)." };
  }

  const system = baseSystemPrompt(false);
  const user = `Descreva o trabalho do time (uma única mensagem):\n${teamDescription.slice(0, 4000)}`;

  const res = await callTogetherApi(
    {
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    { apiKey, baseUrl: base }
  );

  if (!res.ok) {
    const t = res.bodySnippet || "";
    return { ok: false, error: `LLM HTTP ${res.status ?? "?"}: ${t.slice(0, 200)}` };
  }

  const raw = res.assistantText;
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Resposta do modelo inválida." };
  }

  const draft = normalizeDraft(parsed, { requireOkrs: false });
  if (!draft) {
    return { ok: false, error: "Modelo não retornou colunas suficientes." };
  }

  return { ok: true, draft };
}

export function aiDraftToSnapshot(draft: AiTemplateDraft): BoardTemplateSnapshot {
  const labels = draft.labelPalette.slice(0, 100);
  return {
    config: {
      bucketOrder: draft.buckets.map((b) => ({ key: b.key, label: b.label, color: b.color })),
      collapsedColumns: [],
      ...(labels.length ? { labels } : {}),
    },
    mapaProducao: [],
    labelPalette: draft.labelPalette,
    automations: [],
  };
}
