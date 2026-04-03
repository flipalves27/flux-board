import type { BoardData } from "./kv-boards";
import type { SprintData, SprintScopeSnapshot } from "./schemas";
import { SprintScopeSnapshotSchema } from "./schemas";

/** Max distinct card ids captured into a scope snapshot (Mongo-safe). */
export const SPRINT_SCOPE_SNAPSHOT_MAX_CARDS = 500;

/** Approximate max JSON size for `scopeSnapshot` (UTF-16-ish length of JSON.stringify). */
export const SPRINT_SCOPE_SNAPSHOT_MAX_BYTES = 1_200_000;

const MAX_DESC_CHARS = 6000;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function collectSprintScopeCardIds(
  sprint: Pick<SprintData, "cardIds" | "doneCardIds" | "addedMidSprint" | "removedCardIds">
): string[] {
  const set = new Set<string>();
  for (const id of sprint.cardIds) {
    const t = String(id).trim();
    if (t) set.add(t);
  }
  for (const id of sprint.doneCardIds) {
    const t = String(id).trim();
    if (t) set.add(t);
  }
  for (const id of sprint.addedMidSprint) {
    const t = String(id).trim();
    if (t) set.add(t);
  }
  for (const id of sprint.removedCardIds) {
    const t = String(id).trim();
    if (t) set.add(t);
  }
  return [...set];
}

function truncateCardFields(card: Record<string, unknown>): Record<string, unknown> {
  const c = deepClone(card);
  if (typeof c.description === "string" && c.description.length > MAX_DESC_CHARS) {
    c.description = `${c.description.slice(0, MAX_DESC_CHARS)}\n\n[truncated in sprint scope snapshot]`;
  }
  if (typeof c.descriptionMd === "string" && c.descriptionMd.length > MAX_DESC_CHARS) {
    c.descriptionMd = `${c.descriptionMd.slice(0, MAX_DESC_CHARS)}\n\n[truncated in sprint scope snapshot]`;
  }
  return c;
}

export function buildScopeSnapshotFromBoard(params: {
  sprint: Pick<SprintData, "cardIds" | "doneCardIds" | "addedMidSprint" | "removedCardIds">;
  board: Pick<BoardData, "cards" | "config">;
  reason: SprintScopeSnapshot["reason"];
}): { ok: true; snapshot: SprintScopeSnapshot } | { ok: false; error: string } {
  const ids = collectSprintScopeCardIds(params.sprint);
  if (ids.length > SPRINT_SCOPE_SNAPSHOT_MAX_CARDS) {
    return {
      ok: false,
      error: `O escopo desta sprint excede ${SPRINT_SCOPE_SNAPSHOT_MAX_CARDS} cards. Reduza o escopo antes de fechar.`,
    };
  }

  const cardsOnBoard = Array.isArray(params.board.cards) ? params.board.cards : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of cardsOnBoard) {
    if (raw && typeof raw === "object" && "id" in raw) {
      const id = String((raw as { id?: string }).id ?? "").trim();
      if (id) byId.set(id, raw as Record<string, unknown>);
    }
  }

  const cards: unknown[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (c) {
      cards.push(truncateCardFields(c));
    } else {
      cards.push({
        id,
        title: "(card ausente no board no fechamento)",
        missingFromBoardAtClose: true,
      });
    }
  }

  const order = params.board.config?.bucketOrder;
  const bucketOrderSnapshot = Array.isArray(order) ? deepClone(order).slice(0, 120) : [];

  const snapshot: SprintScopeSnapshot = {
    capturedAt: new Date().toISOString(),
    reason: params.reason,
    bucketOrderSnapshot,
    cards,
  };

  const checked = SprintScopeSnapshotSchema.safeParse(snapshot);
  if (!checked.success) {
    return { ok: false, error: "Snapshot inválido; tente novamente ou reduza o escopo." };
  }

  const size = JSON.stringify(checked.data).length;
  if (size > SPRINT_SCOPE_SNAPSHOT_MAX_BYTES) {
    return {
      ok: false,
      error:
        "O snapshot da sprint excede o tamanho máximo (descrições ou anexos muito grandes). Reduza texto nos cards do escopo e tente fechar novamente.",
    };
  }

  return { ok: true, snapshot: checked.data };
}

export function parseScopeSnapshotFromDoc(raw: unknown): SprintScopeSnapshot | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = SprintScopeSnapshotSchema.safeParse(raw);
  return r.success ? r.data : undefined;
}
