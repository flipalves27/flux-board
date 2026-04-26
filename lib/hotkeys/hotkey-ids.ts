/** Stable ids for defaults, cheatsheet copy, and optional localStorage overrides. */
export const HOTKEY_IDS = [
  "nav.boards",
  "nav.reports",
  "nav.forge",
  "nav.forgeRuns",
  "forge.newRun",
  "ui.cheatsheet",
  "board.newCard",
  "board.toggleFilters",
  "board.focusSearch",
  "board.focusMode",
] as const;

export type HotkeyId = (typeof HOTKEY_IDS)[number];
