import type { HotkeyId } from "./hotkey-ids";

/** tinykeys patterns — see https://github.com/jamiebuilds/tinykeys */
export const DEFAULT_HOTKEY_PATTERNS: Record<HotkeyId, string> = {
  "nav.boards": "g b",
  "nav.reports": "g r",
  "nav.forge": "g f",
  /** `g r` is reserved for Reports; runs use second key `u` (queue). */
  "nav.forgeRuns": "g u",
  "forge.newRun": "n f",
  "ui.cheatsheet": "Shift+/",
  "board.newCard": "n",
  "board.toggleFilters": "f",
  "board.focusSearch": "Slash",
  "board.focusMode": "Control+Shift+f",
};
