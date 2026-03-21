import type { BoardData } from "@/lib/kv-boards";
import type { OrgBranding } from "@/lib/org-branding";
import { resolvePlatformDisplayName } from "@/lib/org-branding";
import type { BoardPortalBranding, BoardPortalSettings } from "@/lib/portal-types";

export type { BoardPortalBranding, BoardPortalSettings };

export type PublicPortalCard = {
  id: string;
  bucket: string;
  title: string;
  priority: string;
  progress: string;
  desc: string;
  tags: string[];
  dueDate: string | null;
  order: number;
};

export type PortalMetrics = {
  total: number;
  completed: number;
  completionPercent: number;
  byProgress: Record<string, number>;
};

export type PublicPortalPayload = {
  boardName: string;
  clientLabel?: string;
  branding: BoardPortalBranding;
  /** Nome white-label da organização (substitui Flux-Board no rodapé). */
  platformName?: string;
  bucketOrder: Array<{ key: string; label: string; color: string }>;
  cards: PublicPortalCard[];
  metrics: PortalMetrics;
  lastUpdated?: string;
};

const COMPLETED_PROGRESS = new Set(["Concluída", "Concluído", "Done"]);

function isCompletedProgress(p: string): boolean {
  const s = String(p || "").trim();
  return COMPLETED_PROGRESS.has(s) || /^conclu/i.test(s);
}

export function filterCardsForPortal(board: BoardData, portal: BoardPortalSettings): unknown[] {
  const raw = (board.cards || []) as Array<Record<string, unknown>>;
  let list = raw.filter((c) => c && typeof c.id === "string");

  const keys = portal.visibleBucketKeys;
  if (keys && keys.length > 0) {
    const allow = new Set(keys.map((k) => String(k)));
    list = list.filter((c) => allow.has(String(c.bucket ?? "")));
  }

  const ids = portal.cardIdsAllowlist;
  if (ids && ids.length > 0) {
    const allow = new Set(ids.map((id) => String(id)));
    list = list.filter((c) => allow.has(String(c.id)));
  }

  return list;
}

export function toPublicCard(c: Record<string, unknown>): PublicPortalCard {
  const tags = Array.isArray(c.tags) ? c.tags.map((t) => String(t)).filter(Boolean).slice(0, 30) : [];
  return {
    id: String(c.id ?? ""),
    bucket: String(c.bucket ?? ""),
    title: String(c.title ?? "").slice(0, 300),
    priority: String(c.priority ?? "").slice(0, 100),
    progress: String(c.progress ?? "").slice(0, 100),
    desc: String(c.desc ?? "").slice(0, 4000),
    tags,
    dueDate: c.dueDate == null || c.dueDate === "" ? null : String(c.dueDate),
    order: typeof c.order === "number" && Number.isFinite(c.order) ? c.order : 0,
  };
}

export function computePortalMetrics(cards: PublicPortalCard[]): PortalMetrics {
  const byProgress: Record<string, number> = {};
  let completed = 0;
  for (const c of cards) {
    const p = String(c.progress || "—");
    byProgress[p] = (byProgress[p] || 0) + 1;
    if (isCompletedProgress(c.progress)) completed += 1;
  }
  const total = cards.length;
  return {
    total,
    completed,
    completionPercent: total ? Math.round((completed / total) * 100) : 0,
    byProgress,
  };
}

export function buildBucketOrderForPortal(
  board: BoardData,
  portal: BoardPortalSettings,
  visibleCards: PublicPortalCard[]
): Array<{ key: string; label: string; color: string }> {
  const fullOrder = board.config?.bucketOrder;
  const buckets = Array.isArray(fullOrder)
    ? (fullOrder as unknown[]).map((raw) => {
        const b = raw as { key?: string; label?: string; color?: string };
        return {
          key: String(b?.key ?? ""),
          label: String(b?.label ?? b?.key ?? ""),
          color: String(b?.color ?? "#6C5CE7"),
        };
      })
    : [];

  const usedKeys = new Set(visibleCards.map((c) => c.bucket));
  const keyFilter = portal.visibleBucketKeys;
  const allowKeys =
    keyFilter && keyFilter.length > 0 ? new Set(keyFilter.map((k) => String(k))) : null;

  const ordered: Array<{ key: string; label: string; color: string }> = [];
  for (const b of buckets) {
    if (!b.key) continue;
    if (allowKeys && !allowKeys.has(b.key)) continue;
    if (!usedKeys.has(b.key)) continue;
    ordered.push(b);
  }

  for (const k of usedKeys) {
    if (ordered.some((b) => b.key === k)) continue;
    ordered.push({ key: k, label: k, color: "#6C5CE7" });
  }

  return ordered;
}

export function buildPublicPortalPayload(
  board: BoardData,
  portal: BoardPortalSettings,
  orgBranding?: OrgBranding | null,
  orgName?: string | null
): PublicPortalPayload {
  const filtered = filterCardsForPortal(board, portal);
  const cards = filtered
    .map((c) => toPublicCard(c as Record<string, unknown>))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const ob = orgBranding ?? {};
  const branding: BoardPortalBranding = {
    logoUrl: portal.branding?.logoUrl?.trim() || ob.logoUrl?.trim() || undefined,
    primaryColor: portal.branding?.primaryColor?.trim() || ob.primaryColor?.trim() || undefined,
    secondaryColor: portal.branding?.secondaryColor?.trim() || ob.secondaryColor?.trim() || undefined,
    accentColor: portal.branding?.accentColor?.trim() || ob.accentColor?.trim() || undefined,
    title: portal.branding?.title?.trim() || undefined,
  };

  const platformName = resolvePlatformDisplayName(ob, orgName);

  return {
    boardName: board.name || "Board",
    clientLabel: board.clientLabel?.trim() || undefined,
    branding,
    platformName,
    bucketOrder: buildBucketOrderForPortal(board, portal, cards),
    cards,
    metrics: computePortalMetrics(cards),
    lastUpdated: board.lastUpdated,
  };
}
