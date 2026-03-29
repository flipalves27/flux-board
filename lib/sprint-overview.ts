import type { BoardData } from "./kv-boards";
import type { BurndownSnapshot, SprintData } from "./schemas";

export type SprintCardResolved = {
  id: string;
  title: string;
  bucket: string;
  bucketLabel: string;
  priority: string;
  progress: string;
  assigneeId: string | null;
  completedAt: string | null;
  columnEnteredAt: string | null;
  storyPoints: number | null;
  missing: boolean;
};

export type SprintBurndownDay = { date: string; ideal: number; actual: number };

export type SprintTimelineItem =
  | { kind: "milestone"; at: string; event: "sprint_created" }
  | { kind: "burndown_snapshot"; snapshot: BurndownSnapshot }
  | { kind: "scope_batch"; variant: "added_mid_sprint" | "removed" | "done"; cardIds: string[]; at: string }
  | {
      kind: "column_entered";
      cardId: string;
      title: string;
      columnEnteredAt: string;
      bucketLabel: string;
    };

function bucketLabelForKey(board: BoardData, bucketKey: string): string {
  const order = board.config?.bucketOrder;
  if (!Array.isArray(order)) return bucketKey;
  for (const b of order) {
    if (b && typeof b === "object" && "key" in b && String((b as { key: string }).key) === bucketKey) {
      const label = (b as { label?: string }).label;
      return typeof label === "string" && label.trim() ? label : bucketKey;
    }
  }
  return bucketKey;
}

function cardById(board: BoardData, id: string): Record<string, unknown> | null {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const c = cards.find((x) => x && typeof x === "object" && String((x as { id?: string }).id) === id);
  return c && typeof c === "object" ? (c as Record<string, unknown>) : null;
}

export function resolveCardForSprint(board: BoardData, cardId: string): SprintCardResolved {
  const raw = cardById(board, cardId);
  if (!raw) {
    return {
      id: cardId,
      title: "",
      bucket: "",
      bucketLabel: "",
      priority: "",
      progress: "",
      assigneeId: null,
      completedAt: null,
      columnEnteredAt: null,
      storyPoints: null,
      missing: true,
    };
  }
  const bucket = typeof raw.bucket === "string" ? raw.bucket : "";
  const title = typeof raw.title === "string" ? raw.title : "";
  return {
    id: cardId,
    title: title || "(sem título)",
    bucket,
    bucketLabel: bucket ? bucketLabelForKey(board, bucket) : "",
    priority: typeof raw.priority === "string" ? raw.priority : "",
    progress: typeof raw.progress === "string" ? raw.progress : "",
    assigneeId: typeof raw.assigneeId === "string" ? raw.assigneeId : null,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    columnEnteredAt: typeof raw.columnEnteredAt === "string" ? raw.columnEnteredAt : null,
    storyPoints: typeof raw.storyPoints === "number" && Number.isFinite(raw.storyPoints) ? raw.storyPoints : null,
    missing: false,
  };
}

/** Same computation as burndown route — kept in one place for overview + API reuse. */
export function computeSprintBurndown(
  sprint: SprintData,
  board: BoardData
): { sprintId: string; total: number; startDate: string | null; endDate: string | null; days: SprintBurndownDay[] } | null {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const sprintCards = sprint.cardIds.map((cid) => cards.find((c) => c.id === cid)).filter(Boolean) as Array<Record<string, unknown>>;

  const startDate = sprint.startDate ? new Date(sprint.startDate + "T00:00:00") : null;
  const endDate = sprint.endDate ? new Date(sprint.endDate + "T00:00:00") : null;

  if (!startDate || !endDate) {
    return null;
  }

  const total = sprintCards.length;
  const dayMs = 86400000;
  const days: SprintBurndownDay[] = [];
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs));

  for (let d = 0; d <= durationDays; d++) {
    const dayTs = startDate.getTime() + d * dayMs;
    const dateStr = new Date(dayTs).toISOString().slice(0, 10);
    const ideal = Math.max(0, total - (total / durationDays) * d);
    const doneByDay = sprintCards.filter((c) => {
      const completedAt = typeof c.completedAt === "string" ? c.completedAt : null;
      if (!completedAt) return false;
      return new Date(completedAt).getTime() <= dayTs + dayMs;
    }).length;
    days.push({ date: dateStr, ideal: Math.round(ideal * 10) / 10, actual: total - doneByDay });
  }

  const snapByDate = new Map(sprint.burndownSnapshots.map((s) => [s.date, s]));
  for (const day of days) {
    const snap = snapByDate.get(day.date);
    if (snap) {
      day.actual = snap.remainingCards;
      day.ideal = Math.round(snap.idealRemaining * 10) / 10;
    }
  }

  return {
    sprintId: sprint.id,
    total,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    days,
  };
}

export function buildSprintTimeline(sprint: SprintData, board: BoardData, scopeResolved: SprintCardResolved[]): SprintTimelineItem[] {
  const items: SprintTimelineItem[] = [];
  items.push({ kind: "milestone", at: sprint.createdAt, event: "sprint_created" });

  const snaps = [...sprint.burndownSnapshots].sort((a, b) => a.date.localeCompare(b.date));
  for (const snapshot of snaps) {
    items.push({ kind: "burndown_snapshot", snapshot });
  }

  if (sprint.addedMidSprint.length) {
    items.push({
      kind: "scope_batch",
      variant: "added_mid_sprint",
      cardIds: [...sprint.addedMidSprint],
      at: sprint.updatedAt,
    });
  }
  if (sprint.removedCardIds.length) {
    items.push({
      kind: "scope_batch",
      variant: "removed",
      cardIds: [...sprint.removedCardIds],
      at: sprint.updatedAt,
    });
  }
  if (sprint.doneCardIds.length) {
    items.push({
      kind: "scope_batch",
      variant: "done",
      cardIds: [...sprint.doneCardIds],
      at: sprint.updatedAt,
    });
  }

  const startMs = sprint.startDate ? new Date(sprint.startDate + "T00:00:00").getTime() : null;
  const endMs = sprint.endDate ? new Date(sprint.endDate + "T23:59:59").getTime() : null;

  for (const c of scopeResolved) {
    if (c.missing || !c.columnEnteredAt) continue;
    const entered = new Date(c.columnEnteredAt).getTime();
    if (Number.isNaN(entered)) continue;
    if (startMs !== null && endMs !== null && (entered < startMs || entered > endMs)) continue;
    items.push({
      kind: "column_entered",
      cardId: c.id,
      title: c.title,
      columnEnteredAt: c.columnEnteredAt,
      bucketLabel: c.bucketLabel || c.bucket,
    });
  }

  return items;
}

export type SprintOverviewPayload = {
  boardName: string;
  sprint: SprintData;
  cardsScope: SprintCardResolved[];
  cardsDone: SprintCardResolved[];
  cardsAddedMid: SprintCardResolved[];
  cardsRemoved: SprintCardResolved[];
  burndown: ReturnType<typeof computeSprintBurndown>;
  timeline: SprintTimelineItem[];
};

export function buildSprintOverview(board: BoardData, sprint: SprintData): SprintOverviewPayload {
  const cardsScope = sprint.cardIds.map((id) => resolveCardForSprint(board, id));
  const cardsDone = sprint.doneCardIds.map((id) => resolveCardForSprint(board, id));
  const cardsAddedMid = sprint.addedMidSprint.map((id) => resolveCardForSprint(board, id));
  const cardsRemoved = sprint.removedCardIds.map((id) => resolveCardForSprint(board, id));
  const burndown = computeSprintBurndown(sprint, board);
  const timeline = buildSprintTimeline(sprint, board, cardsScope);
  return {
    boardName: board.name || board.id,
    sprint,
    cardsScope,
    cardsDone,
    cardsAddedMid,
    cardsRemoved,
    burndown,
    timeline,
  };
}

/** Texto compacto para prompts de IA (Fluxy / histórico). Evita dados sensíveis além de títulos e metadados de trabalho. */
export function sprintOverviewToPromptContext(boardName: string, overview: SprintOverviewPayload): string {
  const { sprint, cardsScope, cardsDone, cardsAddedMid, cardsRemoved, burndown, timeline } = overview;
  const lines: string[] = [];
  lines.push(`Quadro: ${boardName}`);
  lines.push(
    `Sprint: ${sprint.name} (id=${sprint.id}) | status=${sprint.status} | cadência=${sprint.cadenceType} | datas=${sprint.startDate ?? "?"} → ${sprint.endDate ?? "?"}`
  );
  if (sprint.goal) lines.push(`Meta: ${sprint.goal}`);
  if (sprint.plannedCapacity != null) lines.push(`Capacidade planejada: ${sprint.plannedCapacity}`);
  if (sprint.commitmentNote) lines.push(`Nota de compromisso: ${sprint.commitmentNote.slice(0, 400)}`);
  if (sprint.wipPolicyNote) lines.push(`Política WIP: ${sprint.wipPolicyNote.slice(0, 300)}`);
  lines.push(`Velocity registrada: ${sprint.velocity ?? "—"}`);

  const fmtCard = (c: SprintCardResolved) =>
    `- [${c.id}] ${c.title.slice(0, 120)} | col=${c.bucketLabel || c.bucket} | prog=${c.progress} | pts=${c.storyPoints ?? "—"}${c.missing ? " | (card ausente no board)" : ""}`;

  lines.push("\nEscopo (cardIds):");
  lines.push(cardsScope.length ? cardsScope.map(fmtCard).join("\n") : "(vazio)");

  lines.push("\nConcluídos (doneCardIds):");
  lines.push(cardsDone.length ? cardsDone.map(fmtCard).join("\n") : "(nenhum)");

  if (cardsAddedMid.length) {
    lines.push("\nAdicionados no meio da sprint:");
    lines.push(cardsAddedMid.map(fmtCard).join("\n"));
  }
  if (cardsRemoved.length) {
    lines.push("\nRemovidos do escopo:");
    lines.push(cardsRemoved.map(fmtCard).join("\n"));
  }

  if (burndown?.days?.length) {
    const last = burndown.days[burndown.days.length - 1];
    lines.push(`\nBurndown: total=${burndown.total} | último dia ${last?.date}: restante=${last?.actual} (ideal=${last?.ideal})`);
  } else {
    lines.push("\nBurndown: indisponível (sem datas ou sem escopo).");
  }

  lines.push("\nLinha do tempo (resumo):");
  const brief = timeline.slice(0, 40).map((ev) => {
    if (ev.kind === "milestone") return `${ev.at}: ${ev.event}`;
    if (ev.kind === "burndown_snapshot")
      return `${ev.snapshot.date}: restante=${ev.snapshot.remainingCards} (+${ev.snapshot.addedToday} / ✓${ev.snapshot.completedToday})`;
    if (ev.kind === "scope_batch") return `${ev.at}: ${ev.variant} (${ev.cardIds.length} cards)`;
    return `${ev.columnEnteredAt}: coluna «${ev.bucketLabel}» — [${ev.cardId}] ${ev.title.slice(0, 80)}`;
  });
  lines.push(brief.join("\n") || "(vazio)");

  return lines.join("\n").slice(0, 24000);
}
