export interface RecentCardEntry {
  boardId: string;
  boardName: string;
  cardId: string;
  title: string;
  openedAt: string;
}

const STORAGE_PREFIX = "flux_recent_cards:";
const MAX_RECENTS = 12;

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitize(raw: unknown): RecentCardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is RecentCardEntry =>
        !!item &&
        typeof item === "object" &&
        typeof (item as RecentCardEntry).boardId === "string" &&
        typeof (item as RecentCardEntry).boardName === "string" &&
        typeof (item as RecentCardEntry).cardId === "string" &&
        typeof (item as RecentCardEntry).title === "string" &&
        typeof (item as RecentCardEntry).openedAt === "string"
    )
    .slice(0, MAX_RECENTS);
}

export function getRecentCards(userId: string): RecentCardEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function registerRecentCard(
  userId: string,
  entry: Omit<RecentCardEntry, "openedAt">
): RecentCardEntry[] {
  if (!isBrowser()) return [];
  const next: RecentCardEntry = {
    ...entry,
    openedAt: new Date().toISOString(),
  };
  const current = getRecentCards(userId);
  const deduped = current.filter(
    (e) => !(e.boardId === next.boardId && e.cardId === next.cardId)
  );
  const list = [next, ...deduped].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
  return list;
}

export function cleanupRecentCards(userId: string, validBoardIds: Set<string>) {
  if (!isBrowser()) return;
  const current = getRecentCards(userId);
  const filtered = current.filter((e) => validBoardIds.has(e.boardId));
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}
