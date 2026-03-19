export interface BoardVisitEntry {
  boardId: string;
  visitedAt: string;
}

interface BoardShortcutsState {
  favorites: string[];
  recents: BoardVisitEntry[];
  visitCounts: Record<string, number>;
}

const STORAGE_PREFIX = "flux_board_shortcuts:";
const MAX_RECENTS = 8;

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitizeState(raw: unknown): BoardShortcutsState {
  if (!raw || typeof raw !== "object") {
    return { favorites: [], recents: [], visitCounts: {} };
  }

  const value = raw as { favorites?: unknown; recents?: unknown; visitCounts?: unknown };
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const recents = Array.isArray(value.recents)
    ? value.recents
        .filter(
          (item): item is BoardVisitEntry =>
            !!item &&
            typeof item === "object" &&
            typeof (item as BoardVisitEntry).boardId === "string" &&
            typeof (item as BoardVisitEntry).visitedAt === "string"
        )
        .slice(0, MAX_RECENTS)
    : [];
  const visitCounts =
    value.visitCounts && typeof value.visitCounts === "object"
      ? Object.fromEntries(
          Object.entries(value.visitCounts).filter(
            ([boardId, count]) => typeof boardId === "string" && typeof count === "number" && count > 0
          )
        )
      : {};

  return { favorites, recents, visitCounts };
}

export function getBoardShortcuts(userId: string): BoardShortcutsState {
  if (!isBrowser()) return { favorites: [], recents: [], visitCounts: {} };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { favorites: [], recents: [], visitCounts: {} };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { favorites: [], recents: [], visitCounts: {} };
  }
}

function saveBoardShortcuts(userId: string, state: BoardShortcutsState) {
  if (!isBrowser()) return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
}

export function toggleBoardFavorite(userId: string, boardId: string): string[] {
  const current = getBoardShortcuts(userId);
  const favorites = current.favorites.includes(boardId)
    ? current.favorites.filter((id) => id !== boardId)
    : [...current.favorites, boardId];

  saveBoardShortcuts(userId, { ...current, favorites });
  return favorites;
}

export function registerBoardVisit(userId: string, boardId: string): BoardVisitEntry[] {
  const current = getBoardShortcuts(userId);
  const nextEntry: BoardVisitEntry = {
    boardId,
    visitedAt: new Date().toISOString(),
  };
  const recents = [nextEntry, ...current.recents.filter((entry) => entry.boardId !== boardId)].slice(0, MAX_RECENTS);
  const visitCounts = {
    ...current.visitCounts,
    [boardId]: (current.visitCounts[boardId] ?? 0) + 1,
  };
  saveBoardShortcuts(userId, { ...current, recents, visitCounts });
  return recents;
}

export function cleanupBoardShortcuts(userId: string, validBoardIds: string[]) {
  const current = getBoardShortcuts(userId);
  const validIds = new Set(validBoardIds);
  const favorites = current.favorites.filter((id) => validIds.has(id));
  const recents = current.recents.filter((entry) => validIds.has(entry.boardId)).slice(0, MAX_RECENTS);
  const visitCounts = Object.fromEntries(
    Object.entries(current.visitCounts).filter(([boardId]) => validIds.has(boardId))
  );
  saveBoardShortcuts(userId, { favorites, recents, visitCounts });
}

export function clearRecentBoards(userId: string): BoardVisitEntry[] {
  const current = getBoardShortcuts(userId);
  saveBoardShortcuts(userId, { ...current, recents: [] });
  return [];
}
