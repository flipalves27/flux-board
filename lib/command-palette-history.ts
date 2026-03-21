import type { HistoryPaletteEntry, PaletteAction } from "@/lib/command-palette-types";

const STORAGE_PREFIX = "flux_command_palette_history:";
const MAX = 5;

function key(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitize(raw: unknown): HistoryPaletteEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryPaletteEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.title !== "string") continue;
    if (
      o.category !== "boards" &&
      o.category !== "cards" &&
      o.category !== "actions" &&
      o.category !== "navigation"
    )
      continue;
    if (!o.action || typeof o.action !== "object") continue;
    const a = o.action as PaletteAction;
    if (
      a.type !== "navigate" &&
      a.type !== "board" &&
      a.type !== "card" &&
      a.type !== "newCard" &&
      a.type !== "newBoard" &&
      a.type !== "copilot"
    )
      continue;
    out.push({
      id: o.id,
      category: o.category,
      title: o.title,
      subtitle: typeof o.subtitle === "string" ? o.subtitle : undefined,
      action: a,
    });
    if (out.length >= MAX) break;
  }
  return out;
}

export function getCommandHistory(userId: string): HistoryPaletteEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function pushCommandHistory(userId: string, entry: HistoryPaletteEntry): HistoryPaletteEntry[] {
  if (!isBrowser()) return [];
  const prev = getCommandHistory(userId);
  const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
