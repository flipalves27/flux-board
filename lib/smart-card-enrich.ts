import type { BoardData } from "@/lib/kv-boards";
import { parseCardCreatedMs } from "@/lib/flux-reports-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9\u00C0-\u024F]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .slice(0, 40);
}

export function similarityScore(queryTitle: string, cardTitle: string, cardDesc: string): number {
  const q = new Set(normalizeWords(queryTitle));
  if (!q.size) return 0;
  const hay = new Set([...normalizeWords(cardTitle), ...normalizeWords(cardDesc).slice(0, 30)]);
  let hit = 0;
  for (const w of q) {
    if (hay.has(w)) hit += 1;
  }
  return hit / Math.max(1, q.size);
}

export type SimilarCardRef = {
  id: string;
  title: string;
  desc: string;
  bucket: string;
  progress: string;
};

export function pickSimilarCardRefs(
  cards: unknown[],
  title: string,
  opts: { limit: number; excludeId?: string }
): SimilarCardRef[] {
  const exclude = String(opts.excludeId || "").trim();
  const scored: Array<{ card: SimilarCardRef; score: number }> = [];
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const id = String(c.id || "").trim();
    if (!id || id === exclude) continue;
    const ct = String(c.title || "").trim();
    const cd = String(c.desc || "").trim();
    const score = similarityScore(title, ct, cd);
    if (score <= 0) continue;
    scored.push({
      score,
      card: {
        id,
        title: ct,
        desc: cd.replace(/\s+/g, " ").slice(0, 360),
        bucket: String(c.bucket || ""),
        progress: String(c.progress || ""),
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit).map((x) => x.card);
}

export type LeadTimeSimilarStats = {
  avgDays: number;
  sampleCount: number;
};

/** Lead time aproximado (dias) de cards concluídos mais similares ao título. */
export function leadTimeStatsFromSimilarConcluded(
  cards: unknown[],
  title: string,
  board: BoardData,
  opts: { topN: number; excludeId?: string }
): LeadTimeSimilarStats {
  const exclude = String(opts.excludeId || "").trim();
  const boardUpdatedRaw = typeof board.lastUpdated === "string" ? board.lastUpdated : null;
  const endMs = boardUpdatedRaw ? new Date(boardUpdatedRaw).getTime() : Date.now();
  if (Number.isNaN(endMs)) return { avgDays: 7, sampleCount: 0 };

  const scored: Array<{ days: number; score: number }> = [];
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.progress || "") !== "Concluída") continue;
    const id = String(c.id || "").trim();
    if (!id || id === exclude) continue;
    const ct = String(c.title || "").trim();
    const cd = String(c.desc || "").trim();
    const score = similarityScore(title, ct, cd);
    if (score <= 0) continue;
    const createdMs = parseCardCreatedMs(raw, board);
    if (createdMs === null) continue;
    const days = Math.max(1, Math.floor((endMs - createdMs) / DAY_MS));
    scored.push({ days, score });
  }
  scored.sort((a, b) => b.score - a.score || a.days - b.days);
  const picked = scored.slice(0, opts.topN);
  if (!picked.length) return { avgDays: 7, sampleCount: 0 };
  const sum = picked.reduce((acc, x) => acc + x.days, 0);
  return { avgDays: sum / picked.length, sampleCount: picked.length };
}

export function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dueDateFromLeadStats(stats: LeadTimeSimilarStats): { dueDate: string | null; explanationKey: "similar" | "none" } {
  if (stats.sampleCount < 1) return { dueDate: null, explanationKey: "none" };
  const rounded = Math.max(1, Math.round(stats.avgDays));
  const ymd = formatYmdLocal(addDaysLocal(new Date(), rounded));
  return { dueDate: ymd, explanationKey: "similar" };
}
