import type { CardData } from "@/app/board/[id]/page";

/** Open (non-done) cards with at least one blocker link. */
export function countColumnBlockedOpen(cards: CardData[]): number {
  let n = 0;
  for (const c of cards) {
    if (c.progress === "Concluída") continue;
    if (Array.isArray(c.blockedBy) && c.blockedBy.length > 0) n++;
  }
  return n;
}

/** Open cards with due date before local calendar today. */
export function countColumnOverdueOpen(cards: CardData[], nowMs: number): number {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime();
  let n = 0;
  for (const c of cards) {
    if (c.progress === "Concluída") continue;
    const d = c.dueDate?.trim();
    if (!d) continue;
    const due = new Date(`${d}T00:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    if (due.getTime() < cutoff) n++;
  }
  return n;
}
