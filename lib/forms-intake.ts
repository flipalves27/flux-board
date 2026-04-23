import { classifyIntakeFormWithTogether } from "@/lib/automation-ai";
import type { BoardData } from "@/lib/kv-boards";
import type { Organization } from "@/lib/kv-organizations";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";
import { sanitizeText } from "@/lib/schemas";

export type IntakeFormConfig = {
  enabled: boolean;
  slug: string;
  title: string;
  description?: string;
  targetBucketKey: string;
  defaultPriority: string;
  defaultProgress: string;
  defaultTags: string[];
};

export type IntakeClassifierInput = {
  title: string;
  description: string;
};

export type IntakeClassifierOutput = {
  bucketKey?: string;
  priority?: string;
  tags: string[];
  rationale: string;
  /** Quando preenchido e válido no quadro, a rota pode fundir a submissão neste card em vez de criar outro. */
  duplicateOfCardId?: string | null;
  duplicateMergeSuggestion?: string;
  usedLlm?: boolean;
  llmModel?: string;
  llmProvider?: string;
};

const TAG_RULES: Array<{ tag: string; keywords: string[] }> = [
  { tag: "Incidente", keywords: ["incidente", "erro", "falha", "bug", "fora do ar", "indisponivel"] },
  { tag: "Comercial", keywords: ["comercial", "cliente", "proposta", "venda"] },
  { tag: "Parceiro", keywords: ["parceiro", "partner", "broker"] },
  { tag: "Subscrição", keywords: ["subscricao", "subscrição", "tomador", "garantia"] },
  { tag: "Plataforma", keywords: ["plataforma", "cadastro", "sistema"] },
];

const PRIORITIES = new Set(["Urgente", "Importante", "Média"]);

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeForSimilarity(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function normalizeFormSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Tags já usadas nos cards do board + tags padrão do formulário (lista para o LLM e filtro). */
export function collectTagsUniverseFromBoard(board: BoardData, extra: string[]): string[] {
  const s = new Set<string>();
  for (const t of extra) {
    const x = String(t).trim();
    if (x) s.add(x);
  }
  const cards = Array.isArray(board.cards) ? board.cards : [];
  for (const c of cards) {
    const tags = (c as { tags?: unknown }).tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        const x = String(t).trim();
        if (x) s.add(x);
      }
    }
  }
  return [...s].filter(Boolean).slice(0, 100);
}

function filterTagsToUniverse(tags: string[], universe: string[]): string[] {
  if (!universe.length) return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
  const byNorm = new Map<string, string>();
  for (const u of universe) {
    byNorm.set(normalizeText(u), u);
  }
  const out: string[] = [];
  for (const t of tags) {
    const raw = String(t).trim();
    if (!raw) continue;
    const canon = byNorm.get(normalizeText(raw));
    if (canon) out.push(canon);
  }
  return [...new Set(out)].slice(0, 8);
}

/**
 * Heurística local: prioriza cards com maior sobreposição lexical com título+descrição da submissão;
 * se tudo for muito fraco, usa os últimos cards do array (inserção recente).
 */
export function pickSimilarCardsForIntake(
  board: BoardData,
  title: string,
  description: string,
  limit = 5
): Array<{ id: string; title: string; desc: string; bucket: string }> {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const queryTokens = tokenizeForSimilarity(`${title} ${description}`);

  const scored = cards
    .map((raw) => {
      const c = raw as Record<string, unknown>;
      const id = String(c.id || "");
      const t = String(c.title || "");
      const d = String(c.desc || "");
      const b = String(c.bucket || "");
      const cardTokens = tokenizeForSimilarity(`${t} ${d}`);
      const score = jaccardSimilarity(queryTokens, cardTokens);
      return { id, title: t.slice(0, 200), desc: d.slice(0, 600), bucket: b, score };
    })
    .filter((x) => x.id);

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  if (top.length && top[0].score < 0.01 && cards.length) {
    return cards
      .slice(-limit)
      .map((raw) => {
        const c = raw as Record<string, unknown>;
        return {
          id: String(c.id || ""),
          title: String(c.title || "").slice(0, 200),
          desc: String(c.desc || "").slice(0, 600),
          bucket: String(c.bucket || ""),
        };
      })
      .filter((x) => x.id);
  }
  return top.map(({ score: _s, ...rest }) => rest);
}

function bucketKeysOnBoard(board: BoardData): string[] {
  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder : [];
  return bucketOrder
    .map((b) => String((b as { key?: string }).key || "").trim())
    .filter(Boolean);
}

function resolveDuplicateCardId(board: BoardData, duplicateCardId: string | null | undefined): string | null {
  if (!duplicateCardId) return null;
  const id = String(duplicateCardId).trim();
  if (!id) return null;
  const cards = Array.isArray(board.cards) ? board.cards : [];
  return cards.some((c) => String((c as { id?: string }).id) === id) ? id : null;
}

export function classifyIntake(input: IntakeClassifierInput): IntakeClassifierOutput {
  const title = normalizeText(sanitizeText(input.title || ""));
  const description = normalizeText(sanitizeText(input.description || ""));
  const fullText = `${title} ${description}`.trim();
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    if (rule.keywords.some((k) => fullText.includes(normalizeText(k)))) {
      tags.add(rule.tag);
    }
  }

  let priority: string | undefined;
  let bucketKey: string | undefined;
  let rationale = "Classificação padrão aplicada.";

  const urgentHit = /(urgente|bloqueado|parado|prazo hoje|hoje|critico|crítico)/.test(fullText);
  const incidentHit = /(incidente|erro|falha|fora do ar|indisponivel|indisponível)/.test(fullText);

  if (incidentHit) {
    bucketKey = "Incidente";
    priority = urgentHit ? "Urgente" : "Importante";
    tags.add("Incidente");
    rationale = "Classificado como incidente com base em palavras-chave.";
  } else if (urgentHit) {
    priority = "Urgente";
    rationale = "Classificado como urgente por sinais de criticidade/prazo.";
  }

  return {
    bucketKey,
    priority,
    tags: [...tags].slice(0, 8),
    rationale,
    usedLlm: false,
  };
}

/**
 * Classifica a submissão com LLM (API compatível com OpenAI) quando configurado; caso contrário usa heurística de `classifyIntake`.
 */
export async function classifyIntakeWithBoardContext(params: {
  board: BoardData;
  formDefaultTags: string[];
  input: IntakeClassifierInput;
  org?: Organization | null;
  /** Quando false, não chama a API (ex.: cota diária esgotada). */
  allowLlm?: boolean;
}): Promise<IntakeClassifierOutput> {
  const { board, formDefaultTags, input, allowLlm = true, org } = params;
  const heuristic = classifyIntake(input);
  const llmReady = isOrgCloudLlmConfigured(org ?? null);

  if (!allowLlm || !llmReady) {
    return { ...heuristic, usedLlm: false };
  }

  const knownTags = collectTagsUniverseFromBoard(board, formDefaultTags);
  const similar = pickSimilarCardsForIntake(board, input.title, input.description, 5);

  const llm = await classifyIntakeFormWithTogether({
    board,
    title: input.title,
    description: input.description,
    knownTags,
    similarCards: similar,
    org,
  });

  if (!llm.ok || !llm.data) {
    return { ...heuristic, usedLlm: false };
  }

  const d = llm.data;
  const allowedBuckets = new Set(bucketKeysOnBoard(board));

  let bucketKey = d.bucketKey && allowedBuckets.has(d.bucketKey) ? d.bucketKey : undefined;
  if (!bucketKey && heuristic.bucketKey && allowedBuckets.has(String(heuristic.bucketKey))) {
    bucketKey = heuristic.bucketKey;
  }

  const pr = d.priority?.trim();
  const priority = pr && PRIORITIES.has(pr) ? pr : undefined;

  const prioFinal = priority || heuristic.priority;

  const fromLlm = filterTagsToUniverse(d.tags || [], knownTags);
  const tagsMerged = fromLlm.length ? fromLlm : heuristic.tags;

  const rationale =
    (d.rationale && d.rationale.length > 0 ? d.rationale : null) || heuristic.rationale;

  let duplicateOfCardId: string | null | undefined;
  let duplicateMergeSuggestion: string | undefined;
  if (d.isLikelyDuplicate && d.duplicateCardId) {
    const resolved = resolveDuplicateCardId(board, d.duplicateCardId);
    if (resolved) {
      duplicateOfCardId = resolved;
      duplicateMergeSuggestion =
        (d.mergeSuggestion && d.mergeSuggestion.length > 0 ? d.mergeSuggestion : null) ||
        "Possível duplicata: considere unificar com o card indicado.";
    }
  }

  return {
    bucketKey,
    priority: prioFinal,
    tags: tagsMerged,
    rationale,
    duplicateOfCardId: duplicateOfCardId ?? null,
    duplicateMergeSuggestion,
    usedLlm: true,
    llmModel: llm.model,
    llmProvider: llm.provider,
  };
}
