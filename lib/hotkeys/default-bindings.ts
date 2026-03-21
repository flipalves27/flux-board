import type { HotkeyId } from "./hotkey-ids";

/** tinykeys patterns — see https://github.com/jamiebuilds/tinykeys */
export const DEFAULT_HOTKEY_PATTERNS: Record<HotkeyId, string> = {
  "nav.boards": "g b",
  "nav.reports": "g r",
  "ui.cheatsheet": "Shift+/",
  "board.newCard": "n",
  "board.toggleFilters": "f",
  "board.focusSearch": "Slash",
};
