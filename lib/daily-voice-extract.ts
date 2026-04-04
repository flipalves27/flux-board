/**
 * Heuristic extraction from daily standup transcripts: match mentioned work to board cards.
 * No LLM — safe for client or server.
 */

export type VoiceToBoardHint = "mentioned" | "possible_blocker" | "progress_done";

export type VoiceToBoardSuggestion = {
  cardId: string;
  title: string;
  score: number;
  hints: VoiceToBoardHint[];
};

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúãõç\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const stop = new Set([
    "o",
    "a",
    "os",
    "as",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "em",
    "no",
    "na",
    "um",
    "uma",
    "para",
    "com",
    "por",
    "que",
    "foi",
    "estou",
    "estamos",
    "trabalhei",
    "trabalhamos",
    "ontem",
    "hoje",
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "i",
    "we",
  ]);
  const out = new Set<string>();
  for (const w of norm(s).split(" ")) {
    if (w.length >= 3 && !stop.has(w)) out.add(w);
  }
  return out;
}

const BLOCK_RE = /\b(bloqueio|bloqueado|blocked|impedimento|depend[oê]ncia|waiting|aguardando)\b/i;
const DONE_RE = /\b(conclu[ií]|finalizei|terminei|entregue|done|finished|complete)\b/i;

/**
 * @param cards minimal { id, title } from board
 */
export function extractVoiceToBoardSuggestions(
  transcript: string,
  cards: Array<{ id: string; title: string }>,
  opts?: { minScore?: number; limit?: number }
): VoiceToBoardSuggestion[] {
  const minScore = opts?.minScore ?? 0.35;
  const limit = opts?.limit ?? 8;
  const tnorm = norm(transcript);
  if (tnorm.length < 12) return [];

  const tTokens = tokenize(transcript);
  if (tTokens.size === 0) return [];

  const scored: VoiceToBoardSuggestion[] = [];

  for (const c of cards) {
    const title = String(c.title || "").trim();
    if (!title) continue;
    const cTokens = tokenize(title);
    if (cTokens.size === 0) continue;

    let inter = 0;
    for (const w of cTokens) {
      if (tTokens.has(w)) inter++;
    }
    const union = cTokens.size + tTokens.size - inter;
    const jaccard = union > 0 ? inter / union : 0;
    const contains =
      tnorm.includes(norm(title).slice(0, Math.min(24, norm(title).length))) && norm(title).length >= 6 ? 0.25 : 0;
    const score = Math.min(1, jaccard * 1.2 + contains);

    if (score < minScore) continue;

    const hints: VoiceToBoardHint[] = [];
    hints.push("mentioned");
    const titlePos = tnorm.indexOf(norm(title).split(" ").slice(0, 3).join(" "));
    const window =
      titlePos >= 0 ? tnorm.slice(Math.max(0, titlePos - 80), Math.min(tnorm.length, titlePos + norm(title).length + 80)) : tnorm;
    if (BLOCK_RE.test(window)) hints.push("possible_blocker");
    if (DONE_RE.test(window)) hints.push("progress_done");

    scored.push({ cardId: c.id, title, score: Math.round(score * 100) / 100, hints });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
