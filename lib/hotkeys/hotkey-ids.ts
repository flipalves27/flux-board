/** Stable ids for defaults, cheatsheet copy, and optional localStorage overrides. */
export const HOTKEY_IDS = [
  "nav.boards",
  "nav.reports",
  "ui.cheatsheet",
  "board.newCard",
  "board.toggleFilters",
  "board.focusSearch",
] as const;

export type HotkeyId = (typeof HOTKEY_IDS)[number];
