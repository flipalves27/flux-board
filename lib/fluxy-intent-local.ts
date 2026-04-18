import type { FluxyIntentKind, FluxyLocalClassification } from "@/lib/fluxy-intent-types";

type Pattern = { intent: FluxyIntentKind; re: RegExp; weight: number };

const NAV_PATTERNS: Pattern[] = [
  { intent: "nav_boards", re: /\b(boards?|quadros?|kanban)\b/i, weight: 0.9 },
  { intent: "nav_portfolio", re: /\b(portfolio|portf[oó]lio|executive|dashboard)\b/i, weight: 0.85 },
  { intent: "nav_routines", re: /\b(routines?|rotinas?|tasks?\s*di[aá]rias?)\b/i, weight: 0.85 },
  { intent: "nav_equipe", re: /\b(equipe|team|usu[aá]rios?|membros?)\b/i, weight: 0.82 },
  { intent: "open_command_palette", re: /\b(palette|command|atalho|ctrl\s*\+?\s*k)\b/i, weight: 0.75 },
];

const PT_BR_EXTRA: Pattern[] = [
  {
    intent: "board_nlq",
    re: /\b(pesquisar|buscar|filtrar|mostrar|listar)\b.+\b(cards?|tarefas?|atividades?)\b|\b(nlq|consulta\s+natural)\b|\/query\b/i,
    weight: 0.68,
  },
  {
    intent: "board_copilot",
    re: /\b(copilot|assistente|fluxy|chat\s+do\s+board)\b/i,
    weight: 0.66,
  },
  {
    intent: "board_new_card",
    re: /\b(novo|criar|adicionar)\s+(um\s+)?(card|tarefa|item)\b/i,
    weight: 0.7,
  },
];

const EN_EXTRA: Pattern[] = [
  {
    intent: "board_nlq",
    re: /\b(find|search|filter|show|list)\b.+\b(cards?|tasks?|work\s*items?)\b|\bnlq\b|\/query\b/i,
    weight: 0.68,
  },
  {
    intent: "board_copilot",
    re: /\b(copilot|assistant|board\s+chat)\b/i,
    weight: 0.66,
  },
  {
    intent: "board_new_card",
    re: /\b(new|create|add)\s+(a\s+)?(card|task|item)\b/i,
    weight: 0.7,
  },
];

function speechFor(kind: FluxyIntentKind, locale: string): string {
  const isEn = locale === "en";
  switch (kind) {
    case "nav_boards":
      return isEn ? "Opening boards." : "Abrindo boards.";
    case "nav_portfolio":
      return isEn ? "Opening portfolio." : "Abrindo portfólio.";
    case "nav_routines":
      return isEn ? "Opening routines." : "Abrindo rotinas.";
    case "nav_equipe":
      return isEn ? "Opening team." : "Abrindo equipe.";
    case "open_command_palette":
      return isEn ? "Opening command palette." : "Abrindo paleta de comandos.";
    case "board_copilot":
      return isEn ? "Opening board copilot." : "Abrindo copiloto do board.";
    case "board_nlq":
      return isEn ? "Running a board NLQ." : "Consulta em linguagem natural no board.";
    case "board_new_card":
      return isEn ? "Starting a new card." : "Iniciando novo card.";
    default:
      return isEn ? "Choose a destination below." : "Escolha um destino abaixo.";
  }
}

/**
 * Locale-aware heuristics (regex). Safe for client bundles — no server-only imports.
 */
export function classifyIntentLocalSync(raw: string, locale: string): FluxyLocalClassification {
  const q = String(raw || "").trim();
  if (!q) return { intent: "unknown", confidence: 0, speech: speechFor("unknown", locale) };

  const extras = locale === "en" ? EN_EXTRA : PT_BR_EXTRA;
  const patterns = [...NAV_PATTERNS, ...extras];

  let best: FluxyLocalClassification = { intent: "unknown", confidence: 0, speech: speechFor("unknown", locale) };
  for (const { intent, re, weight } of patterns) {
    if (re.test(q) && weight > best.confidence) {
      best = { intent, confidence: weight, speech: speechFor(intent, locale) };
    }
  }
  return best;
}

/** @deprecated Prefer `classifyIntentLocalSync` with locale. */
export function classifyFluxyIntentLocalCompat(raw: string): { intent: FluxyIntentKind; confidence: number } {
  const r = classifyIntentLocalSync(raw, "pt-BR");
  return { intent: r.intent, confidence: r.confidence };
}
