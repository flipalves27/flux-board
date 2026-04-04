import type { CardData } from "@/app/board/[id]/page";

type CardWithTimestamps = CardData & { createdAt?: string; updatedAt?: string };

/** Cycle lengths (days) from completed cards for lightweight on-board predictions. */
export function buildHistoricalCycleDaysFromCards(cards: CardData[]): number[] {
  const out: number[] = [];
  for (const c of cards) {
    if (c.progress !== "Concluída") continue;
    if (typeof c.completedCycleDays === "number" && Number.isFinite(c.completedCycleDays) && c.completedCycleDays > 0 && c.completedCycleDays < 180) {
      out.push(c.completedCycleDays);
      continue;
    }
    const raw = c as CardWithTimestamps;
    const created = raw.createdAt;
    const updated = raw.updatedAt;
    if (!created || !updated) continue;
    const days = (new Date(String(updated)).getTime() - new Date(String(created)).getTime()) / 86400000;
    if (days > 0 && days < 180) out.push(days);
  }
  return out;
}
