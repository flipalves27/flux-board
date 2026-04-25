import type { z } from "zod";
import { BoardUpdateSchema } from "@/lib/schemas";
import type { getBoard } from "@/lib/kv-boards";

type BoardUpdate = z.infer<typeof BoardUpdateSchema>;
type KvBoard = NonNullable<Awaited<ReturnType<typeof getBoard>>>;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const ka = Object.keys(oa).sort();
  const kb = Object.keys(ob).sort();
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(ob, k)) return false;
    if (!deepEqual(oa[k], ob[k])) return false;
  }
  return true;
}

/**
 * Regras de colunas/wip/metodologia — não inclui `collapsedColumns` (preferência de UI) nem `labels` (equipe comum ajusta tags).
 */
function structuralConfigSlice(
  config: { bucketOrder?: unknown; wipEnforcement?: unknown; definitionOfDone?: unknown; cardRules?: unknown; productGoal?: unknown; executiveStakeholderNote?: unknown; backlogBucketKey?: unknown; sipocDraft?: unknown } | undefined | null
): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  const out: Record<string, unknown> = {
    bucketOrder: c.bucketOrder,
    wipEnforcement: c.wipEnforcement,
    definitionOfDone: c.definitionOfDone,
    cardRules: c.cardRules,
    productGoal: c.productGoal,
    executiveStakeholderNote: c.executiveStakeholderNote,
    backlogBucketKey: c.backlogBucketKey,
    sipocDraft: c.sipocDraft,
  };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function normName(v: string | undefined): string {
  return String(v ?? "").trim();
}

/**
 * Diz se o `PUT` pede mutações reservadas a quem `roleCanAdmin` (dono, admin org, membro admin do board).
 */
export function boardUpdateRequiresAdmin(
  update: BoardUpdate,
  prev: KvBoard,
  wipOverrideReason: string
): boolean {
  if (wipOverrideReason.length >= 8) return true;

  if (update.name !== undefined && normName(update.name) !== normName(prev.name)) {
    return true;
  }
  if (update.clientLabel !== undefined) {
    const next = String(update.clientLabel ?? "").trim();
    const p = String(prev.clientLabel ?? "").trim();
    if (next !== p) return true;
  }
  if (update.boardMethodology !== undefined && update.boardMethodology !== prev.boardMethodology) {
    return true;
  }
  if (update.mapaProducao !== undefined && !deepEqual(update.mapaProducao, prev.mapaProducao ?? [])) {
    return true;
  }
  if (update.dailyInsights !== undefined && !deepEqual(update.dailyInsights, prev.dailyInsights ?? [])) {
    return true;
  }
  // portal / anomaly / intake: alterações vêm de modais dedicados ou PUT parcial; validação adicional no handler se necessário

  if (update.config !== undefined) {
    const prevCfg = (prev.config ?? {}) as Record<string, unknown>;
    const patch = update.config as Record<string, unknown>;
    const merged = { ...prevCfg, ...patch };
    if (!deepEqual(structuralConfigSlice(merged), structuralConfigSlice(prev.config))) {
      return true;
    }
  }

  return false;
}
