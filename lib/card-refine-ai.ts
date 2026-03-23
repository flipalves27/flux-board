export type CardRefineLlmResult = {
  acceptanceCriteria: string[];
  risks: string[];
  dependencies: string[];
  notes?: string;
};

export function buildCardRefineUserPrompt(title: string, description: string): string {
  return `Você é um Product Owner auxiliando refinamento de backlog Kanban. Card:

Título: "${title.slice(0, 300)}"
Descrição:
${description.slice(0, 4000)}

Responda APENAS com JSON válido (sem markdown):
{
  "acceptanceCriteria": ["string", "..."],
  "risks": ["string"],
  "dependencies": ["string"],
  "notes": "string opcional com observações curtas"
}
Máximo 8 critérios, 5 riscos, 5 dependências. Português brasileiro.`;
}

export function parseCardRefineJson(raw: string): CardRefineLlmResult | null {
  const t = raw.trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  };
  let data = tryParse(t);
  if (!data && t.includes("```")) {
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m?.[1]) data = tryParse(m[1].trim());
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const arr = (k: string) =>
    Array.isArray(o[k]) ? o[k].filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  const ac = arr("acceptanceCriteria").slice(0, 8);
  const risks = arr("risks").slice(0, 5);
  const deps = arr("dependencies").slice(0, 5);
  const notes = typeof o.notes === "string" ? o.notes.trim().slice(0, 500) : undefined;
  if (ac.length === 0 && risks.length === 0 && deps.length === 0) return null;
  return { acceptanceCriteria: ac, risks, dependencies: deps, ...(notes ? { notes } : {}) };
}
