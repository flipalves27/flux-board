const STORAGE_KEY = "flux-sidebar-nav-freq:v1";
const MAX_KEYS = 48;

export type SidebarNavFreqMap = Record<string, number>;

export function readSidebarNavFreq(): SidebarNavFreqMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SidebarNavFreqMap;
  } catch {
    return {};
  }
}

export function bumpSidebarNavFreq(path: string): void {
  if (typeof window === "undefined" || !path) return;
  try {
    const prev = readSidebarNavFreq();
    const next: SidebarNavFreqMap = { ...prev, [path]: (prev[path] ?? 0) + 1 };
    const sorted = Object.entries(next)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_KEYS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(sorted)));
    window.dispatchEvent(new Event("flux-sidebar-nav-freq"));
  } catch {
    /* quota / private mode */
  }
}

export function scoreForSidebarPath(path: string, map: SidebarNavFreqMap): number {
  return map[path] ?? 0;
}
