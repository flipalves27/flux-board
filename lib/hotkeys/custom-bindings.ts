import type { HotkeyId } from "./hotkey-ids";
import { HOTKEY_IDS } from "./hotkey-ids";
import { DEFAULT_HOTKEY_PATTERNS } from "./default-bindings";

/** Persisted overrides merged with `DEFAULT_HOTKEY_PATTERNS`. Future: Command Palette may write here. */
const STORAGE_KEY = "flux_hotkey_patterns:v1";

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitize(raw: unknown): Partial<Record<HotkeyId, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<HotkeyId, string>> = {};
  for (const id of HOTKEY_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && v.trim().length > 0) {
      out[id] = v.trim();
    }
  }
  return out;
}

export function loadCustomHotkeyPatterns(): Partial<Record<HotkeyId, string>> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitize(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveCustomHotkeyPatterns(overrides: Partial<Record<HotkeyId, string>>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota */
  }
}

/** Resolved tinykeys pattern per id (custom wins over default). */
export function resolveHotkeyPatterns(): Record<HotkeyId, string> {
  const custom = loadCustomHotkeyPatterns();
  const out = { ...DEFAULT_HOTKEY_PATTERNS };
  for (const id of HOTKEY_IDS) {
    const c = custom[id];
    if (c) out[id] = c;
  }
  return out;
}
