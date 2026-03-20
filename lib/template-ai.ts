import { safeJsonParse } from "./template-ai-parse";
import type { BoardTemplateSnapshot } from "./template-types";

export type AiTemplateDraft = {
  title: string;
  description: string;
  category: string;
  buckets: Array<{ key: string; label: string; color: string }>;
  labelPalette: string[];
  automationIdeas: string[];
};

function extractTextFromLlmContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (p && typeof p === "object") {
          const text = (p as { text?: string }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

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

  const system = `Você projeta templates de quadro Kanban para operações comerciais.
Responda APENAS JSON válido (sem markdown). Campos obrigatórios:
- title: string curta
- description: 1-3 frases em português
- category: uma de ${JSON.stringify(CATEGORIES)}
- buckets: array de 4 a 8 objetos { "key", "label", "color" } onde key e label são strings não vazias, color é hex #RRGGBB
- labelPalette: 5 a 20 tags curtas sugeridas para cards
- automationIdeas: 2 a 5 frases curtas descrevendo automações úteis (texto livre; não implemente JSON de automação)`;

  const user = `Descreva o trabalho do time:\n${teamDescription.slice(0, 4000)}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `LLM HTTP ${res.status}: ${t.slice(0, 200)}` };
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = extractTextFromLlmContent(data?.choices?.[0]?.message?.content);
  const parsed = safeJsonParse(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Resposta do modelo inválida." };
  }

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

  if (buckets.length < 2) {
    return { ok: false, error: "Modelo não retornou colunas suficientes." };
  }

  const lp = Array.isArray(parsed.labelPalette) ? parsed.labelPalette : [];
  const labelPalette = lp
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, 30);

  const ai = Array.isArray(parsed.automationIdeas) ? parsed.automationIdeas : [];
  const automationIdeas = ai.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 8);

  return {
    ok: true,
    draft: {
      title,
      description,
      category,
      buckets,
      labelPalette,
      automationIdeas,
    },
  };
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
