import type { BoardDefinitionOfDone, BucketConfig, CardData } from "@/app/board/[id]/page";

const DONE_HINT = /\b(conclu[ií]|done|fechad|entregue|produ[cç][aã]o)\b/i;

export function resolveBacklogBucketKey(
  bucketOrder: BucketConfig[],
  explicit?: string | null
): string | null {
  if (!bucketOrder.length) return null;
  if (explicit && bucketOrder.some((b) => b.key === explicit)) return explicit;
  const byName = bucketOrder.find(
    (b) => b.key.toLowerCase().includes("backlog") || b.label.toLowerCase().includes("backlog")
  );
  if (byName) return byName.key;
  return bucketOrder[0]?.key ?? null;
}

export function resolveDoneBucketKeys(
  bucketOrder: BucketConfig[],
  explicit?: string[] | null
): string[] {
  const keys = (explicit ?? []).map((k) => k.trim()).filter(Boolean);
  if (keys.length > 0) {
    const allowed = new Set(bucketOrder.map((b) => b.key));
    return keys.filter((k) => allowed.has(k));
  }
  return bucketOrder
    .filter((b) => DONE_HINT.test(b.key) || DONE_HINT.test(b.label))
    .map((b) => b.key);
}

export function isCardCompletedState(
  card: Pick<CardData, "bucket" | "progress">,
  doneBucketKeys: string[],
  completedProgressLabel: string
): boolean {
  if (card.progress === completedProgressLabel) return true;
  if (doneBucketKeys.length > 0 && doneBucketKeys.includes(card.bucket)) return true;
  return false;
}

export function cardMeetsDefinitionOfDone(
  card: Pick<CardData, "dodChecks">,
  def: BoardDefinitionOfDone
): boolean {
  if (!def.enabled || !def.items.length) return true;
  const checks = card.dodChecks ?? {};
  return def.items.every((it) => checks[it.id] === true);
}

export function dodBlockReason(
  card: Pick<CardData, "title" | "dodChecks">,
  def: BoardDefinitionOfDone
): string | null {
  if (!def.enabled || !def.enforce || !def.items.length) return null;
  if (cardMeetsDefinitionOfDone(card, def)) return null;
  const missing = def.items.filter((it) => !(card.dodChecks ?? {})[it.id]).map((it) => it.label);
  const preview = missing.slice(0, 3).join(", ");
  const suffix = missing.length > 3 ? "…" : "";
  return `"${card.title.slice(0, 80)}": marque o Definition of Done (${preview}${suffix})`;
}

export type BoardScrumConfigSlice = {
  definitionOfDone?: BoardDefinitionOfDone;
  backlogBucketKey?: string;
};

export function getBoardScrumConfigFromConfig(
  config: { bucketOrder?: BucketConfig[]; definitionOfDone?: BoardDefinitionOfDone; backlogBucketKey?: string }
): BoardScrumConfigSlice {
  return {
    definitionOfDone: config.definitionOfDone,
    backlogBucketKey: config.backlogBucketKey,
  };
}

/** Valida transição para estado concluído (cliente antes de aplicar DnD / modal). */
export function assertDodAllowsCompleting(params: {
  card: CardData;
  nextBucket: string;
  nextProgress: string;
  doneBucketKeys: string[];
  completedProgressLabel: string;
  def?: BoardDefinitionOfDone;
}): { ok: true } | { ok: false; message: string } {
  const { card, nextBucket, nextProgress, doneBucketKeys, completedProgressLabel, def } = params;
  const wasDone = isCardCompletedState(card, doneBucketKeys, completedProgressLabel);
  const willBeDone = isCardCompletedState(
    { bucket: nextBucket, progress: nextProgress },
    doneBucketKeys,
    completedProgressLabel
  );
  if (wasDone || !willBeDone || !def) return { ok: true };
  const reason = dodBlockReason(card, def);
  if (reason) return { ok: false, message: reason };
  return { ok: true };
}

/**
 * Validação no PUT do board: impede concluir sem DoD quando enforce está ativo.
 */
export function validateDodOnBoardPut(params: {
  prevCards: unknown[];
  nextCards: unknown[];
  bucketOrder: BucketConfig[];
  definitionOfDone?: BoardDefinitionOfDone;
  backlogBucketKey?: string;
  completedProgressLabel?: string;
}): { ok: true } | { ok: false; message: string } {
  const def = params.definitionOfDone;
  const completedLabel = params.completedProgressLabel ?? "Concluída";
  const doneKeys = resolveDoneBucketKeys(params.bucketOrder, def?.doneBucketKeys ?? null);
  if (!def?.enabled || !def.enforce || !def.items.length) return { ok: true };

  const prevById = new Map(
    params.prevCards.map((c) => {
      const r = c as CardData;
      return [String(r.id), r] as const;
    })
  );

  for (const raw of params.nextCards) {
    const next = raw as CardData;
    const prev = prevById.get(String(next.id));
    if (!prev) continue;
    const wasDone = isCardCompletedState(prev, doneKeys, completedLabel);
    const willBeDone = isCardCompletedState(next, doneKeys, completedLabel);
    if (wasDone || !willBeDone) continue;
    const reason = dodBlockReason(next, def);
    if (reason) return { ok: false, message: reason };
  }
  return { ok: true };
}
