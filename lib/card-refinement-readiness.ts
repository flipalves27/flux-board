/**
 * Heuristic backlog refinement readiness (0–100) for sprint planning.
 * Complements LLM-based refine in `card-refine-ai.ts`.
 */

export type RefinementReadinessReason = { code: string; message: string; weight: number };

export type RefinementReadinessResult = {
  score: number;
  reasons: RefinementReadinessReason[];
};

export type CardRefinementInput = {
  title: string;
  desc: string;
  priority?: string | null;
  progress?: string | null;
  dueDate?: string | null;
  tags?: string[] | null;
  blockedBy?: string[] | null;
  acceptanceCriteriaText?: string | null;
  estimatePoints?: number | null;
  /** Scrum DoR flags from card */
  dorReady?: { acceptanceOk?: boolean; titleOk?: boolean; depsOk?: boolean; sizedOk?: boolean } | null;
};

const DONE = ["Concluída", "Done", "Closed", "Cancelada"];

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * @param similarDoneCount — optional count of similar completed cards (same board), for historical signal
 */
export function computeRefinementReadinessScore(
  card: CardRefinementInput,
  opts?: { similarDoneCount?: number }
): RefinementReadinessResult {
  const reasons: RefinementReadinessReason[] = [];
  let raw = 0;
  const max = 100;

  const title = String(card.title || "").trim();
  const desc = String(card.desc || "").trim();
  const progress = String(card.progress || "");

  if (DONE.includes(progress)) {
    return { score: 100, reasons: [{ code: "done", message: "Card concluído — readiness não se aplica.", weight: 0 }] };
  }

  if (title.length >= 8) {
    raw += 12;
    reasons.push({ code: "title_ok", message: "Título definido.", weight: 12 });
  } else {
    reasons.push({ code: "title_short", message: "Título muito curto ou vazio.", weight: -12 });
  }

  const wc = wordCount(desc);
  if (wc >= 25) {
    raw += 22;
    reasons.push({ code: "desc_rich", message: "Descrição com bom contexto.", weight: 22 });
  } else if (wc >= 10) {
    raw += 14;
    reasons.push({ code: "desc_ok", message: "Descrição básica presente.", weight: 14 });
  } else if (wc >= 3) {
    raw += 6;
    reasons.push({ code: "desc_thin", message: "Descrição superficial.", weight: 6 });
  } else {
    reasons.push({ code: "desc_missing", message: "Falta descrição útil.", weight: -18 });
  }

  const ac = String(card.acceptanceCriteriaText || "").trim();
  const dorAc = card.dorReady?.acceptanceOk === true;
  if (ac.length >= 20 || dorAc) {
    raw += 20;
    reasons.push({
      code: "acceptance",
      message: dorAc ? "Definition of Ready: critérios OK." : "Critérios de aceitação indicados.",
      weight: 20,
    });
  } else {
    reasons.push({ code: "no_acceptance", message: "Sem critérios de aceitação explícitos.", weight: -15 });
  }

  const est = card.estimatePoints;
  if (typeof est === "number" && Number.isFinite(est) && est > 0) {
    raw += 12;
    reasons.push({ code: "estimated", message: "Estimativa numérica presente.", weight: 12 });
  } else if (card.dorReady?.sizedOk === true) {
    raw += 12;
    reasons.push({ code: "dor_sized", message: "Definition of Ready: item dimensionado.", weight: 12 });
  } else {
    const hasEstInDesc = /\b(\d+)\s*(pts?|points?|sp|story|horas?|h)\b/i.test(desc);
    if (hasEstInDesc) {
      raw += 8;
      reasons.push({ code: "estimate_in_desc", message: "Estimativa mencionada na descrição.", weight: 8 });
    } else {
      reasons.push({ code: "no_estimate", message: "Sem estimativa clara.", weight: -10 });
    }
  }

  const deps = Array.isArray(card.blockedBy) ? card.blockedBy.filter(Boolean) : [];
  if (deps.length > 0) {
    raw += 10;
    reasons.push({ code: "deps_mapped", message: "Dependências mapeadas (blockedBy).", weight: 10 });
  } else if (/\b(depende|bloqueio|blocked|depends)\b/i.test(desc)) {
    raw += 5;
    reasons.push({ code: "deps_mentioned", message: "Dependências mencionadas no texto.", weight: 5 });
  } else {
    reasons.push({ code: "deps_unknown", message: "Dependências não mapeadas.", weight: -6 });
  }

  if (card.dueDate && String(card.dueDate).trim()) {
    raw += 4;
    reasons.push({ code: "due_date", message: "Data alvo definida.", weight: 4 });
  }

  const tags = Array.isArray(card.tags) ? card.tags : [];
  if (tags.length >= 1) {
    raw += 5;
    reasons.push({ code: "tags", message: "Tags ajudam triagem e busca.", weight: 5 });
  }

  const sim = opts?.similarDoneCount ?? 0;
  if (sim >= 3) {
    raw += 10;
    reasons.push({ code: "similar_history", message: "Histórico de cards similares concluídos no board.", weight: 10 });
  } else if (sim >= 1) {
    raw += 5;
    reasons.push({ code: "some_similar", message: "Alguns cards similares já concluídos.", weight: 5 });
  }

  const score = Math.round(Math.max(0, Math.min(max, raw)));
  return { score, reasons };
}

/** Client/server shared mapping from modal or API card shape. */
export function buildRefinementInputFromFields(p: {
  title: string;
  descriptionText: string;
  priority?: string | null;
  progress?: string | null;
  dueDate?: string | null;
  tags?: string[];
  blockedBy?: string[];
  storyPoints?: number | null;
  dorReady?: CardRefinementInput["dorReady"];
}): CardRefinementInput {
  const desc = String(p.descriptionText || "");
  let acceptanceCriteriaText = "";
  const acMatch = desc.match(/(?:critérios?\s+de\s+aceitação|acceptance\s+criteria)[:\s]*([\s\S]{10,2000})/i);
  if (acMatch?.[1]) acceptanceCriteriaText = acMatch[1].trim();

  return {
    title: String(p.title || ""),
    desc,
    priority: p.priority ?? null,
    progress: p.progress ?? null,
    dueDate: p.dueDate ?? null,
    tags: p.tags ?? [],
    blockedBy: p.blockedBy ?? [],
    acceptanceCriteriaText: acceptanceCriteriaText || undefined,
    estimatePoints: typeof p.storyPoints === "number" && Number.isFinite(p.storyPoints) ? p.storyPoints : null,
    dorReady: p.dorReady ?? null,
  };
}
