export type FluxyIntent =
  | "nav_boards"
  | "nav_portfolio"
  | "nav_routines"
  | "nav_equipe"
  | "open_command_palette"
  | "unknown";

export type FluxyIntentClassification = {
  intent: FluxyIntent;
  /** 0–1 heurística local (sem LLM). */
  confidence: number;
};

const NAV_PATTERNS: Array<{ intent: FluxyIntent; re: RegExp; weight: number }> = [
  { intent: "nav_boards", re: /\b(boards?|quadros?|kanban)\b/i, weight: 0.9 },
  { intent: "nav_portfolio", re: /\b(portfolio|portf[oó]lio|executive|dashboard)\b/i, weight: 0.85 },
  { intent: "nav_routines", re: /\b(routines?|rotinas?|tasks?\s*di[aá]rias?)\b/i, weight: 0.85 },
  { intent: "nav_equipe", re: /\b(equipe|team|usu[aá]rios?|membros?)\b/i, weight: 0.82 },
  { intent: "open_command_palette", re: /\b(palette|command|atalho|ctrl\s*\+?\s*k)\b/i, weight: 0.75 },
];

/**
 * Classificador leve (regex). Cache LLM/redis fica em rotas servidor-only — não importar `ai-completion-cache` aqui
 * para evitar puxar `mongodb` para o bundle do cliente.
 */
export function classifyFluxyIntentLocal(raw: string): FluxyIntentClassification {
  const q = String(raw || "").trim();
  if (!q) return { intent: "unknown", confidence: 0 };
  let best: FluxyIntentClassification = { intent: "unknown", confidence: 0 };
  for (const { intent, re, weight } of NAV_PATTERNS) {
    if (re.test(q) && weight > best.confidence) {
      best = { intent, confidence: weight };
    }
  }
  return best;
}
