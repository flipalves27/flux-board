/** Shared types for Fluxy Omnibar classification (client + server). */

export const FLUXY_INTENT_KINDS = [
  "nav_boards",
  "nav_portfolio",
  "nav_routines",
  "nav_equipe",
  "open_command_palette",
  "board_copilot",
  "board_nlq",
  "board_new_card",
  "unknown",
] as const;

export type FluxyIntentKind = (typeof FLUXY_INTENT_KINDS)[number];

export type FluxyCostHint = "none" | "low" | "medium" | "high";

export type FluxyClassifyContext = {
  /** URL pathname including locale, e.g. `/pt-BR/board/abc`. */
  pathname: string;
  /** Board id when user is on a board page. */
  boardId?: string;
  /** When true, server skips cloud LLM (local + cache only). */
  localOnly?: boolean;
};

export type FluxyOmnibarAction =
  | { type: "navigate"; path: string }
  | { type: "event"; name: "flux-open-command-palette" | "flux-open-fluxy-omnibar"; detail?: Record<string, string> };

export type FluxyOmnibarResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  action: FluxyOmnibarAction;
};

export type FluxyClassifierTier = "local" | "compat_fast" | "compat_full";

export type FluxyClassifyMeta = {
  costHint: FluxyCostHint;
  /** Which path ran last: heurística local | LLM rápido | LLM mais capaz (OpenAI-compat). */
  classifierTier: FluxyClassifierTier;
  confidence: number;
  locale: string;
  budgetBlocked?: boolean;
  cacheHit?: boolean;
};

export type FluxyClassifyResponse = {
  intent: FluxyIntentKind;
  speech: string;
  results: FluxyOmnibarResultItem[];
  meta: FluxyClassifyMeta;
};

export type FluxyLocalClassification = {
  intent: FluxyIntentKind;
  confidence: number;
  speech: string;
};
