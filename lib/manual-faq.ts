import type { ManualFaqItem } from "./manual-faq-data";
import { MANUAL_FAQ_EN, MANUAL_FAQ_PT } from "./manual-faq-data";

export { MANUAL_FAQ_EN, MANUAL_FAQ_PT };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

/**
 * Perguntas respostas heurísticas sobre o manual (antes do LLM, ou como fallback).
 */
export function matchManualFaq(
  query: string,
  locale: "en" | "pt-BR",
  minScore = 3
): { bestIndex: number; score: number; item: ManualFaqItem } | null {
  const items: readonly ManualFaqItem[] = locale === "en" ? MANUAL_FAQ_EN : MANUAL_FAQ_PT;
  const q = normalize(query).trim();
  if (!q) return null;

  const queryWords = [...new Set(q.split(/\s+/).filter((w) => w.length > 1))];
  if (!queryWords.length) return null;

  let bestIdx = -1;
  let bestScore = 0;

  items.forEach((item, idx) => {
    const hay = normalize(`${item.q} ${item.a}`);
    let score = 0;
    for (const w of queryWords) {
      if (hay.includes(w)) score += 2;
    }
    if (hay.includes(q)) score += 6;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  if (bestIdx < 0 || bestScore < minScore) return null;
  return { bestIndex: bestIdx, score: bestScore, item: items[bestIdx]! };
}

export function slugifyForChunk(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9áàâãéèêíïóôõúüç]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
