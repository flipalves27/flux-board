export type LandingFaqMatchItem = {
  question: string;
  answer: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

/**
 * Correspondência simples por palavras no texto da pergunta + resposta do FAQ.
 * Retorna o índice do melhor item ou null se a confiança for baixa.
 */
export function matchLandingFaq(
  query: string,
  items: readonly LandingFaqMatchItem[],
  minScore = 3
): { bestIndex: number; score: number } | null {
  const q = normalize(query).trim();
  if (!q) return null;

  const queryWords = [...new Set(q.split(/\s+/).filter((w) => w.length > 1))];
  if (!queryWords.length) return null;

  let bestIdx = -1;
  let bestScore = 0;

  items.forEach((item, idx) => {
    const hay = normalize(`${item.question} ${item.answer}`);
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
  return { bestIndex: bestIdx, score: bestScore };
}
