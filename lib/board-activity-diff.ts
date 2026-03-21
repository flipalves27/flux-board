import type { BoardActivityAction, BoardActivityDelta, BoardSnapshotForActivity } from "./board-activity-types";

const MAX_TARGET = 220;

function trunc(s: string): string {
  const t = String(s || "").trim();
  if (t.length <= MAX_TARGET) return t;
  return `${t.slice(0, MAX_TARGET - 1)}…`;
}

type BucketRow = { key: string; label: string; color?: string };

function parseBucketOrder(config: BoardSnapshotForActivity["config"]): BucketRow[] {
  const bo = config?.bucketOrder;
  if (!Array.isArray(bo)) return [];
  const out: BucketRow[] = [];
  for (const raw of bo) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = String(r.key || "").trim();
    if (!key) continue;
    const label = String(r.label || key).trim();
    const color = r.color !== undefined ? String(r.color) : undefined;
    out.push({ key, label, color });
  }
  return out;
}

function bucketLabelMap(rows: BucketRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.key, r.label);
  return m;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as object).sort();
  const o = value as Record<string, unknown>;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

function redactPortal(p: unknown): unknown {
  if (!p || typeof p !== "object") return p;
  const o = { ...(p as Record<string, unknown>) };
  delete o.token;
  delete o.portalPassword;
  delete o.regenerateToken;
  return o;
}

function cardAsRecord(c: unknown): Record<string, unknown> | null {
  if (!c || typeof c !== "object") return null;
  return c as Record<string, unknown>;
}

function cardTitle(c: Record<string, unknown>): string {
  return trunc(String(c.title || c.id || "Card"));
}

function snapshotForContentCompare(c: Record<string, unknown>): string {
  const snap = {
    title: c.title,
    desc: c.desc,
    priority: c.priority,
    progress: c.progress,
    tags: Array.isArray(c.tags) ? [...c.tags].map(String).sort() : [],
    direction: c.direction,
    dueDate: c.dueDate,
    blockedBy: Array.isArray(c.blockedBy) ? [...c.blockedBy].map(String).sort() : [],
    links: c.links,
    docRefs: c.docRefs,
  };
  return stableStringify(snap);
}

function buildCardMap(cards: unknown[] | undefined): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(cards)) return m;
  for (const raw of cards) {
    const c = cardAsRecord(raw);
    const id = c ? String(c.id || "").trim() : "";
    if (!id || !c) continue;
    m.set(id, c);
  }
  return m;
}

function push(entries: BoardActivityDelta[], action: BoardActivityAction, target: string, details: Record<string, unknown> | null) {
  entries.push({ action, target: trunc(target), details });
}

/**
 * Compares two board snapshots and returns audit deltas (no I/O).
 */
export function diffBoardActivity(prev: BoardSnapshotForActivity, next: BoardSnapshotForActivity): BoardActivityDelta[] {
  const entries: BoardActivityDelta[] = [];

  const prevBuckets = parseBucketOrder(prev.config);
  const nextBuckets = parseBucketOrder(next.config);
  const prevKeys = prevBuckets.map((b) => b.key);
  const nextKeys = nextBuckets.map((b) => b.key);
  const prevKeySet = new Set(prevKeys);
  const nextKeySet = new Set(nextKeys);

  const prevLabelByKey = bucketLabelMap(prevBuckets);
  const nextLabelByKey = bucketLabelMap(nextBuckets);

  for (const k of nextKeys) {
    if (!prevKeySet.has(k)) {
      const label = nextLabelByKey.get(k) || k;
      push(entries, "column.added", label, { columnKey: k });
    }
  }
  for (const k of prevKeys) {
    if (!nextKeySet.has(k)) {
      const label = prevLabelByKey.get(k) || k;
      push(entries, "column.removed", label, { columnKey: k });
    }
  }

  for (const row of nextBuckets) {
    if (!prevKeySet.has(row.key)) continue;
    const prevRow = prevBuckets.find((p) => p.key === row.key);
    if (!prevRow) continue;
    if (prevRow.label !== row.label || prevRow.color !== row.color) {
      push(entries, "board.settings_changed", row.label || row.key, {
        kind: "column_metadata",
        columnKey: row.key,
        labelChanged: prevRow.label !== row.label,
        colorChanged: prevRow.color !== row.color,
      });
    }
  }

  const prevOrderSig = prevKeys.join("\u001f");
  const nextOrderSig = nextKeys.join("\u001f");
  if (prevKeySet.size === nextKeySet.size && prevKeys.length === nextKeys.length && prevOrderSig !== nextOrderSig) {
    push(entries, "board.settings_changed", trunc(next.name || "Board"), { kind: "column_order" });
  }

  const prevCards = buildCardMap(prev.cards as unknown[] | undefined);
  const nextCards = buildCardMap(next.cards as unknown[] | undefined);

  for (const [id, nc] of nextCards) {
    if (!prevCards.has(id)) {
      push(entries, "card.created", cardTitle(nc), { cardId: id, bucket: String(nc.bucket || "") });
    }
  }

  for (const [id, pc] of prevCards) {
    if (!nextCards.has(id)) {
      push(entries, "card.deleted", cardTitle(pc), { cardId: id, bucket: String(pc.bucket || "") });
    }
  }

  for (const [id, nc] of nextCards) {
    const pc = prevCards.get(id);
    if (!pc) continue;

    const fromB = String(pc.bucket || "");
    const toB = String(nc.bucket || "");
    const fromL = prevLabelByKey.get(fromB) || fromB;
    const toL = nextLabelByKey.get(toB) || toB;

    if (fromB !== toB) {
      push(entries, "card.moved", cardTitle(nc), {
        cardId: id,
        fromBucket: fromB,
        toBucket: toB,
        fromLabel: fromL,
        toLabel: toL,
      });
    }

    const contentChanged = snapshotForContentCompare(pc) !== snapshotForContentCompare(nc);
    if (contentChanged) {
      if (fromB === toB) {
        push(entries, "card.updated", cardTitle(nc), { cardId: id, bucket: toB });
      } else {
        push(entries, "card.updated", cardTitle(nc), { cardId: id, bucket: toB, note: "content_with_move" });
      }
    }
  }

  const settingsFields: string[] = [];

  if (String(prev.name || "") !== String(next.name || "")) settingsFields.push("name");
  if (String(prev.clientLabel || "") !== String(next.clientLabel || "")) settingsFields.push("clientLabel");

  if (stableStringify(redactPortal(prev.portal)) !== stableStringify(redactPortal(next.portal))) {
    settingsFields.push("portal");
  }
  if (stableStringify(prev.mapaProducao) !== stableStringify(next.mapaProducao)) settingsFields.push("mapaProducao");
  if (stableStringify(prev.dailyInsights) !== stableStringify(next.dailyInsights)) settingsFields.push("dailyInsights");
  if (stableStringify(prev.anomalyNotifications) !== stableStringify(next.anomalyNotifications)) {
    settingsFields.push("anomalyNotifications");
  }
  if (stableStringify(prev.intakeForm) !== stableStringify(next.intakeForm)) settingsFields.push("intakeForm");
  if (stableStringify(prev.config?.collapsedColumns) !== stableStringify(next.config?.collapsedColumns)) {
    settingsFields.push("collapsedColumns");
  }
  if (stableStringify(prev.config?.labels) !== stableStringify(next.config?.labels)) {
    settingsFields.push("configLabels");
  }

  if (settingsFields.length) {
    push(entries, "board.settings_changed", trunc(next.name || "Board"), { fields: settingsFields });
  }

  return entries;
}
