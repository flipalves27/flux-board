import type { CardData, BucketConfig } from "@/app/board/[id]/page";

export interface AutomationSuggestion {
  id: string;
  description: string;
  confidence: number;
  trigger: string;
  action: string;
  pattern: string;
}

const MAX_SUGGESTIONS = 3;
const TAG_COLUMN_THRESHOLD = 0.7;
const STAGNATION_DAYS = 5;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function detectTagColumnAffinity(
  cards: CardData[],
  buckets: BucketConfig[],
): AutomationSuggestion[] {
  const tagBucketCount = new Map<string, Map<string, number>>();
  const tagTotal = new Map<string, number>();

  for (const c of cards) {
    for (const tag of c.tags ?? []) {
      const t = tag.trim().toLowerCase();
      if (!t) continue;
      tagTotal.set(t, (tagTotal.get(t) ?? 0) + 1);
      let bm = tagBucketCount.get(t);
      if (!bm) {
        bm = new Map();
        tagBucketCount.set(t, bm);
      }
      bm.set(c.bucket, (bm.get(c.bucket) ?? 0) + 1);
    }
  }

  const results: AutomationSuggestion[] = [];
  const bucketLabelMap = new Map(buckets.map((b) => [b.key, b.label]));

  for (const [tag, bmap] of tagBucketCount) {
    const total = tagTotal.get(tag) ?? 0;
    if (total < 3) continue;
    for (const [bucketKey, count] of bmap) {
      const ratio = count / total;
      if (ratio >= TAG_COLUMN_AFFINITY_THRESHOLD) {
        const colLabel = bucketLabelMap.get(bucketKey) ?? bucketKey;
        results.push({
          id: `tag-col-${tag}-${bucketKey}`,
          description: `Cards tagged "${tag}" are usually moved to "${colLabel}" — auto-move on creation?`,
          confidence: Math.min(0.95, ratio),
          trigger: `card created with tag "${tag}"`,
          action: `move to column "${colLabel}"`,
          pattern: `${Math.round(ratio * 100)}% of "${tag}" cards end up in "${colLabel}" (${count}/${total})`,
        });
      }
    }
  }
  return results;
}

const TAG_COLUMN_AFFINITY_THRESHOLD = TAG_COLUMN_THRESHOLD;

function detectWipViolations(
  cards: CardData[],
  buckets: BucketConfig[],
): AutomationSuggestion[] {
  const results: AutomationSuggestion[] = [];
  const countByBucket = new Map<string, number>();

  for (const c of cards) {
    countByBucket.set(c.bucket, (countByBucket.get(c.bucket) ?? 0) + 1);
  }

  for (const b of buckets) {
    if (!b.wipLimit || b.wipLimit <= 0) continue;
    const count = countByBucket.get(b.key) ?? 0;
    if (count > b.wipLimit) {
      const overBy = count - b.wipLimit;
      const severity = Math.min(0.95, 0.6 + overBy * 0.05);
      results.push({
        id: `wip-${b.key}`,
        description: `"${b.label}" exceeds WIP limit (${count}/${b.wipLimit}) — auto-notify when limit reached?`,
        confidence: severity,
        trigger: `column "${b.label}" exceeds WIP limit of ${b.wipLimit}`,
        action: "notify board owner",
        pattern: `Currently ${overBy} card(s) over the limit`,
      });
    }
  }
  return results;
}

function detectStagnantCards(
  cards: CardData[],
  buckets: BucketConfig[],
): AutomationSuggestion[] {
  const bucketLabelMap = new Map(buckets.map((b) => [b.key, b.label]));
  const stagnantByBucket = new Map<string, number>();

  for (const c of cards) {
    const days = daysSince(c.columnEnteredAt);
    if (days !== null && days >= STAGNATION_DAYS) {
      stagnantByBucket.set(c.bucket, (stagnantByBucket.get(c.bucket) ?? 0) + 1);
    }
  }

  const results: AutomationSuggestion[] = [];
  for (const [bucketKey, count] of stagnantByBucket) {
    if (count < 2) continue;
    const label = bucketLabelMap.get(bucketKey) ?? bucketKey;
    results.push({
      id: `stagnant-${bucketKey}`,
      description: `${count} cards stagnant in "${label}" for ${STAGNATION_DAYS}+ days — auto-flag for review?`,
      confidence: Math.min(0.9, 0.5 + count * 0.08),
      trigger: `card stuck in "${label}" for ${STAGNATION_DAYS} days`,
      action: "add tag 'needs-review' and notify owner",
      pattern: `${count} card(s) idle in "${label}" over ${STAGNATION_DAYS} days`,
    });
  }
  return results;
}

function detectEmptyDescriptionPattern(cards: CardData[]): AutomationSuggestion[] {
  const noDesc = cards.filter(
    (c) => !c.desc || c.desc.trim() === "" || c.desc.trim() === "Sem descrição." || c.desc.trim() === "No description.",
  );
  if (noDesc.length < 3) return [];
  const ratio = noDesc.length / cards.length;
  if (ratio < 0.15) return [];
  return [
    {
      id: "empty-desc",
      description: `${noDesc.length} cards have no description — auto-flag for refinement?`,
      confidence: Math.min(0.85, 0.4 + ratio),
      trigger: "card created without description",
      action: "add tag 'needs-refinement'",
      pattern: `${Math.round(ratio * 100)}% of cards lack a description (${noDesc.length}/${cards.length})`,
    },
  ];
}

function detectPriorityColumnAffinity(
  cards: CardData[],
  buckets: BucketConfig[],
): AutomationSuggestion[] {
  const prioCount = new Map<string, Map<string, number>>();
  const prioTotal = new Map<string, number>();

  for (const c of cards) {
    const p = c.priority;
    if (!p) continue;
    prioTotal.set(p, (prioTotal.get(p) ?? 0) + 1);
    let bm = prioCount.get(p);
    if (!bm) {
      bm = new Map();
      prioCount.set(p, bm);
    }
    bm.set(c.bucket, (bm.get(c.bucket) ?? 0) + 1);
  }

  const results: AutomationSuggestion[] = [];
  const bucketLabelMap = new Map(buckets.map((b) => [b.key, b.label]));
  const highPriorities = new Set(["Urgente", "urgent", "Importante", "important"]);

  for (const [prio, bmap] of prioCount) {
    if (!highPriorities.has(prio)) continue;
    const total = prioTotal.get(prio) ?? 0;
    if (total < 3) continue;
    for (const [bucketKey, count] of bmap) {
      const ratio = count / total;
      if (ratio >= 0.65) {
        const colLabel = bucketLabelMap.get(bucketKey) ?? bucketKey;
        results.push({
          id: `prio-col-${prio}-${bucketKey}`,
          description: `"${prio}" cards usually end up in "${colLabel}" — auto-move on priority set?`,
          confidence: Math.min(0.9, ratio * 0.95),
          trigger: `card priority set to "${prio}"`,
          action: `move to column "${colLabel}"`,
          pattern: `${Math.round(ratio * 100)}% of "${prio}" cards are in "${colLabel}" (${count}/${total})`,
        });
      }
    }
  }
  return results;
}

export function detectAutomationPatterns(
  cards: CardData[],
  buckets: BucketConfig[],
): AutomationSuggestion[] {
  if (cards.length < 3) return [];

  const all: AutomationSuggestion[] = [
    ...detectTagColumnAffinity(cards, buckets),
    ...detectWipViolations(cards, buckets),
    ...detectStagnantCards(cards, buckets),
    ...detectEmptyDescriptionPattern(cards),
    ...detectPriorityColumnAffinity(cards, buckets),
  ];

  all.sort((a, b) => b.confidence - a.confidence);
  return all.slice(0, MAX_SUGGESTIONS);
}
