import type { BoardData, BucketConfig, CardData } from "@/app/board/[id]/page";
import type { SubtaskData } from "@/lib/schemas";
import { isSafeLinkUrl, SubtaskSchema } from "@/lib/schemas";

type CardPersistSource = CardData & {
  subtasks?: unknown[];
  subtaskProgress?: { total: number; done: number; blocked: number; pct: number };
};

const TITLE_FALLBACK = "—";

function normalizeBucket(b: BucketConfig): BucketConfig {
  const key = String(b.key ?? "").trim().slice(0, 200);
  const label = String(b.label ?? "").trim().slice(0, 200);
  const color = String(b.color ?? "").trim().slice(0, 50);
  let wipLimit: number | undefined;
  if (typeof b.wipLimit === "number" && Number.isFinite(b.wipLimit)) {
    const w = Math.floor(b.wipLimit);
    if (w >= 1 && w <= 999) wipLimit = w;
  }
  const policy = String((b as { policy?: string }).policy ?? "").trim().slice(0, 500);
  return {
    key: key.length > 0 ? key : "col",
    label: label.length > 0 ? label : "Coluna",
    color: color.length > 0 ? color : "var(--flux-text-muted)",
    ...(wipLimit !== undefined ? { wipLimit } : {}),
    ...(policy ? { policy } : {}),
  };
}

/**
 * Garante que cards e colunas atendem ao `BoardUpdateSchema` no PUT.
 * Evita 400 ao mover colunas quando algum card legado tem título vazio, order inválido ou links quebrados.
 */
export function normalizeBoardForPersist(db: BoardData): BoardData {
  const bucketOrderRaw = db.config?.bucketOrder?.length
    ? db.config.bucketOrder.map(normalizeBucket)
    : [];
  const bucketKeys = new Set(bucketOrderRaw.map((b) => b.key));
  const fallbackBucket = bucketOrderRaw[0]?.key ?? "Backlog";

  const cards: CardData[] = (db.cards ?? []).map((raw) => {
    const c = raw as CardPersistSource;
    const rest: Record<string, unknown> = { ...(c as unknown as Record<string, unknown>) };
    delete rest.subtasks;
    delete rest.subtaskProgress;
    const title = String(c.title ?? "").trim().slice(0, 300);
    const orderRaw = Number(c.order);
    const order = Number.isFinite(orderRaw)
      ? Math.max(0, Math.min(1_000_000, Math.floor(orderRaw)))
      : 0;

    const bucket = String(c.bucket ?? "").trim().slice(0, 200);
    const safeBucket = bucketKeys.has(bucket) ? bucket : fallbackBucket;

    const priority = String(c.priority ?? "").trim().slice(0, 100) || "Média";
    const progress = String(c.progress ?? "").trim().slice(0, 100) || "Não iniciado";

    const links = Array.isArray(c.links)
      ? c.links
          .filter((l) => l && typeof l.url === "string" && isSafeLinkUrl(String(l.url).trim()))
          .map((l) => ({
            url: String(l.url).trim().slice(0, 2048),
            ...(l.label != null && String(l.label).trim()
              ? { label: String(l.label).trim().slice(0, 200) }
              : {}),
          }))
      : undefined;

    const docRefs = Array.isArray(c.docRefs)
      ? c.docRefs
          .filter((d) => d && typeof d.docId === "string" && String(d.docId).trim())
          .map((d) => ({
            docId: String(d.docId).trim().slice(0, 200),
            ...(d.title != null ? { title: String(d.title).trim().slice(0, 200) } : {}),
            ...(d.excerpt != null ? { excerpt: String(d.excerpt).trim().slice(0, 500) } : {}),
          }))
      : undefined;

    const subtasksParsed = Array.isArray(c.subtasks)
      ? c.subtasks
          .map((s: unknown) => SubtaskSchema.safeParse(s))
          .filter((r): r is { success: true; data: SubtaskData } => r.success)
          .map((r) => r.data)
          .slice(0, 50)
      : undefined;

    const base: Record<string, unknown> = {
      ...rest,
      id: String(c.id ?? "").trim().slice(0, 200) || `id-${order}`,
      bucket: safeBucket,
      priority,
      progress,
      title: title.length > 0 ? title : TITLE_FALLBACK,
      desc: String(c.desc ?? "").slice(0, 6000),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t).trim().slice(0, 60)).slice(0, 30) : [],
      links,
      docRefs,
      direction: c.direction != null ? String(c.direction).trim().slice(0, 100) || null : null,
      dueDate: c.dueDate != null ? String(c.dueDate).trim().slice(0, 50) || null : null,
      blockedBy: Array.isArray(c.blockedBy)
        ? [...new Set(c.blockedBy.map((id) => String(id).trim().slice(0, 200)).filter(Boolean))].slice(0, 50)
        : undefined,
      order,
      ...(c.columnEnteredAt != null ? { columnEnteredAt: String(c.columnEnteredAt).trim().slice(0, 80) } : {}),
      ...(c.completedAt != null ? { completedAt: String(c.completedAt).trim().slice(0, 80) } : {}),
      ...(c.completedCycleDays != null && Number.isFinite(Number(c.completedCycleDays))
        ? { completedCycleDays: Math.max(0, Math.min(3650, Math.floor(Number(c.completedCycleDays)))) }
        : {}),
      ...(c.automationState ? { automationState: c.automationState } : {}),
    };
    if (subtasksParsed && subtasksParsed.length > 0) {
      base.subtasks = subtasksParsed;
    }
    if (c.subtaskProgress) {
      base.subtaskProgress = c.subtaskProgress;
    }
    const dor = (c as { dorReady?: unknown }).dorReady;
    if (dor && typeof dor === "object") {
      const dr = dor as Record<string, unknown>;
      const d: Record<string, boolean> = {};
      if (dr.titleOk === true) d.titleOk = true;
      if (dr.acceptanceOk === true) d.acceptanceOk = true;
      if (dr.depsOk === true) d.depsOk = true;
      if (dr.sizedOk === true) d.sizedOk = true;
      if (Object.keys(d).length) base.dorReady = d as CardData["dorReady"];
    }
    return base as unknown as CardData;
  });

  const bucketOrder = bucketOrderRaw.length > 0 ? bucketOrderRaw : [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }];

  let intakeForm = db.intakeForm;
  if (intakeForm?.slug != null) {
    const slug = String(intakeForm.slug).trim();
    if (slug.length > 0 && slug.length < 3) {
      intakeForm = { ...intakeForm, slug: undefined };
    }
  }

  return {
    ...db,
    cards,
    config: {
      ...db.config,
      bucketOrder,
      collapsedColumns: (db.config?.collapsedColumns ?? [])
        .map((k) => String(k).trim().slice(0, 200))
        .filter((k) => bucketOrder.some((b) => b.key === k)),
      labels: db.config?.labels?.length
        ? db.config.labels.map((l) => String(l).trim().slice(0, 200)).filter(Boolean)
        : db.config?.labels,
    },
    ...(intakeForm !== undefined ? { intakeForm } : {}),
  };
}
