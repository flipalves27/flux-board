import type { BoardData } from "@/lib/kv-boards";
import type { AnomalyAlertPayload } from "@/lib/anomaly-detection";
import type { CardCrossDependencyLink } from "@/lib/kv-card-dependencies";

function parseDueMs(dueDate: string | null | undefined): number | null {
  if (!dueDate || typeof dueDate !== "string") return null;
  const d = new Date(`${dueDate.trim()}T00:00:00`);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function isOverdue(c: { progress?: string; dueDate?: string | null }, todayStartMs: number): boolean {
  if (String(c.progress || "") === "Concluída") return false;
  const due = parseDueMs(c.dueDate ?? null);
  if (due === null) return false;
  return due < todayStartMs;
}

function cardById(boards: BoardData[], boardId: string, cardId: string) {
  const b = boards.find((x) => x.id === boardId);
  if (!b || !Array.isArray(b.cards)) return null;
  const c = b.cards.find((raw) => (raw as { id?: string }).id === cardId);
  return c && typeof c === "object" ? (c as Record<string, unknown>) : null;
}

/**
 * depends_on: source depende de target → target é bloqueador de source.
 * blocks: source bloqueia target → source é bloqueador de target.
 */
export function buildCrossBoardBlockerAlerts(
  boards: BoardData[],
  links: CardCrossDependencyLink[],
  nowMs: number
): AnomalyAlertPayload[] {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const todayStartMs = today.getTime();

  const boardName = new Map(boards.map((b) => [b.id, String(b.name || b.id)]));

  const out: AnomalyAlertPayload[] = [];

  for (const l of links) {
    if (l.kind === "related_to") continue;

    let blockerBoardId: string;
    let blockerCardId: string;
    let dependentBoardId: string;

    if (l.kind === "depends_on") {
      blockerBoardId = l.targetBoardId;
      blockerCardId = l.targetCardId;
      dependentBoardId = l.sourceBoardId;
    } else {
      // blocks
      blockerBoardId = l.sourceBoardId;
      blockerCardId = l.sourceCardId;
      dependentBoardId = l.targetBoardId;
    }

    if (blockerBoardId === dependentBoardId) continue;

    const blocker = cardById(boards, blockerBoardId, blockerCardId);
    if (!blocker || !isOverdue(blocker as { progress?: string; dueDate?: string | null }, todayStartMs)) continue;

    const depBoardName = boardName.get(dependentBoardId) || dependentBoardId;
    const blkBoardName = boardName.get(blockerBoardId) || blockerBoardId;
    const bTitle = String(blocker.title || blockerCardId);

    out.push({
      kind: "cross_board_blocker_overdue",
      severity: "warning",
      title: "Bloqueador cross-board atrasado",
      message: `O card “${bTitle}” (${blkBoardName}) está atrasado e afeta trabalho em “${depBoardName}” via dependência ${l.kind === "depends_on" ? "depende de" : "bloqueia"}.`,
      diagnostics: {
        linkId: l._id,
        edgeKind: l.kind,
        blockerBoardId,
        blockerCardId,
        dependentBoardId,
        confidence: l.confidence,
      },
      boardId: dependentBoardId,
      boardName: depBoardName,
    });
  }

  return dedupeAlerts(out);
}

function dedupeAlerts(alerts: AnomalyAlertPayload[]): AnomalyAlertPayload[] {
  const seen = new Set<string>();
  const res: AnomalyAlertPayload[] = [];
  for (const a of alerts) {
    const d = a.diagnostics as { blockerCardId?: string; dependentBoardId?: string };
    const key = `${d.dependentBoardId}:${d.blockerCardId}:${a.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(a);
  }
  return res;
}
