import type { BoardData, BoardDefinitionOfDone, BucketConfig, CardData } from "@/app/board/[id]/page";
import { resolveBucketToColumnKey } from "@/lib/board-bucket-resolve";
import type { SubtaskData } from "@/lib/schemas";
import {
  CardAutomationStateSchema,
  CARD_SERVICE_CLASS_VALUES,
  computeSubtaskProgress,
  DailyInsightEntrySchema,
  isSafeLinkUrl,
  MapaProducaoItemSchema,
  SipocDraftSchema,
  STORY_POINTS_FIBONACCI,
  SubtaskProgressSchema,
  SubtaskSchema,
} from "@/lib/schemas";

/** Zod `.optional()` não aceita `null`; remove chaves nulas para o PUT não retornar 400. */
function omitEntryNulls<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}

function sanitizePortalForPut(portal: NonNullable<BoardData["portal"]>): BoardData["portal"] {
  const p = omitEntryNulls({ ...(portal as unknown as Record<string, unknown>) }) as Record<string, unknown>;
  const b = p.branding;
  if (b && typeof b === "object") {
    p.branding = omitEntryNulls(b as Record<string, unknown>);
  }
  return p as BoardData["portal"];
}

/**
 * `BoardUpdateSchema` usa `.min()` em campos opcionais: se a chave existe com string vazia ou slug curto, o PUT retorna 400.
 */
function sanitizeIntakeFormForPut(form: BoardData["intakeForm"]): BoardData["intakeForm"] | undefined {
  if (!form || typeof form !== "object") return undefined;
  const o: Record<string, unknown> = { ...(form as unknown as Record<string, unknown>) };

  if (typeof o.slug === "string") {
    const s = o.slug.trim().slice(0, 80);
    if (s.length < 3) delete o.slug;
    else o.slug = s;
  }

  for (const [key, max] of [
    ["title", 120],
    ["targetBucketKey", 200],
    ["defaultPriority", 100],
    ["defaultProgress", 100],
  ] as const) {
    if (typeof o[key] !== "string") continue;
    const t = o[key].trim().slice(0, max);
    if (!t) delete o[key];
    else o[key] = t;
  }

  if (typeof o.description === "string") {
    const t = o.description.trim().slice(0, 400);
    o.description = t.length > 0 ? t : null;
  }

  if (Array.isArray(o.defaultTags)) {
    const tags = (o.defaultTags as unknown[])
      .map((x) => (typeof x === "string" ? x.trim().slice(0, 60) : ""))
      .filter(Boolean);
    if (tags.length === 0) delete o.defaultTags;
    else o.defaultTags = tags.slice(0, 20);
  }

  return omitEntryNulls(o) as BoardData["intakeForm"];
}

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
  const normalizedLabels = Array.isArray(db.config?.labels)
    ? [...new Set(db.config.labels.map((l) => String(l).trim().slice(0, 200)).filter(Boolean))]
    : [];
  const normalizedLabelSet = new Set(normalizedLabels);
  const bucketOrderRaw = db.config?.bucketOrder?.length
    ? db.config.bucketOrder.map(normalizeBucket)
    : [];
  const bucketKeys = new Set(bucketOrderRaw.map((b) => b.key));
  const bucketsForCardResolve: BucketConfig[] =
    bucketOrderRaw.length > 0
      ? bucketOrderRaw
      : [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }];
  const dodValidIds = new Set(
    (db.config?.definitionOfDone?.items ?? []).map((it) => String(it.id || "").trim()).filter(Boolean)
  );

  const cards: CardData[] = (db.cards ?? []).map((raw) => {
    const c = raw as CardPersistSource;
    const rest: Record<string, unknown> = { ...(c as unknown as Record<string, unknown>) };
    delete rest.subtasks;
    delete rest.subtaskProgress;
    /** Zod `.optional()` rejeita `null`; o KV/API podem enviar null em campos omitidos. */
    delete rest.columnEnteredAt;
    delete rest.completedAt;
    delete rest.completedCycleDays;
    delete rest.automationState;
    delete rest.dorReady;
    delete rest.dodChecks;
    delete rest.storyPoints;
    delete rest.serviceClass;
    delete rest.matrixWeight;
    delete rest.matrixWeightBand;
    delete rest.assigneeId;
    const title = String(c.title ?? "").trim().slice(0, 300);
    const orderRaw = Number(c.order);
    const order = Number.isFinite(orderRaw)
      ? Math.max(0, Math.min(1_000_000, Math.floor(orderRaw)))
      : 0;

    const bucket = String(c.bucket ?? "").trim().slice(0, 200);
    const safeBucket = resolveBucketToColumnKey(bucket, bucketsForCardResolve).slice(0, 200);

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

    /** Clona para objetos literais — Immer/proxies podem falhar no SubtaskSchema.safeParse e viravam []. */
    let subtasksPlain: unknown[] | undefined;
    if (Array.isArray(c.subtasks) && c.subtasks.length > 0) {
      try {
        subtasksPlain = JSON.parse(JSON.stringify(c.subtasks)) as unknown[];
      } catch {
        subtasksPlain = [...c.subtasks];
      }
    }
    const subtasksParsed = Array.isArray(subtasksPlain)
      ? subtasksPlain
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
      tags: Array.isArray(c.tags)
        ? c.tags
            .map((t) => String(t).trim().slice(0, 60))
            .filter((t) => normalizedLabelSet.has(t))
            .slice(0, 30)
        : [],
      links,
      docRefs,
      direction: c.direction != null ? String(c.direction).trim().slice(0, 100) || null : null,
      dueDate: c.dueDate != null ? String(c.dueDate).trim().slice(0, 50) || null : null,
      blockedBy: Array.isArray(c.blockedBy)
        ? [...new Set(c.blockedBy.map((id) => String(id).trim().slice(0, 200)).filter(Boolean))].slice(0, 50)
        : undefined,
      order,
      assigneeId:
        c.assigneeId != null && String(c.assigneeId).trim()
          ? String(c.assigneeId).trim().slice(0, 200)
          : null,
      ...(c.columnEnteredAt != null ? { columnEnteredAt: String(c.columnEnteredAt).trim().slice(0, 80) } : {}),
      ...(c.completedAt != null ? { completedAt: String(c.completedAt).trim().slice(0, 80) } : {}),
      ...(c.completedCycleDays != null && Number.isFinite(Number(c.completedCycleDays))
        ? { completedCycleDays: Math.max(0, Math.min(3650, Math.floor(Number(c.completedCycleDays)))) }
        : {}),
    };
    if (c.automationState && typeof c.automationState === "object") {
      const ap = CardAutomationStateSchema.safeParse(c.automationState);
      if (ap.success) base.automationState = ap.data;
    }
    if (subtasksParsed && subtasksParsed.length > 0) {
      base.subtasks = subtasksParsed;
      const prog =
        c.subtaskProgress && typeof c.subtaskProgress === "object"
          ? SubtaskProgressSchema.safeParse(c.subtaskProgress)
          : null;
      if (prog?.success) {
        base.subtaskProgress = prog.data;
      } else {
        base.subtaskProgress = computeSubtaskProgress(subtasksParsed);
      }
    } else if (Array.isArray(c.subtasks) && c.subtasks.length === 0) {
      base.subtasks = [];
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
    const rawDod = (c as { dodChecks?: unknown }).dodChecks;
    if (dodValidIds.size > 0 && rawDod && typeof rawDod === "object") {
      const chk: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(rawDod as Record<string, unknown>)) {
        const id = String(k).trim().slice(0, 80);
        if (!dodValidIds.has(id) || v !== true) continue;
        chk[id] = true;
      }
      if (Object.keys(chk).length > 0) base.dodChecks = chk;
    }

    const spRaw = (c as { storyPoints?: unknown }).storyPoints;
    if (typeof spRaw === "number" && Number.isInteger(spRaw) && (STORY_POINTS_FIBONACCI as readonly number[]).includes(spRaw)) {
      base.storyPoints = spRaw;
    }

    const scRaw = (c as { serviceClass?: unknown }).serviceClass;
    if (typeof scRaw === "string" && (CARD_SERVICE_CLASS_VALUES as readonly string[]).includes(scRaw)) {
      base.serviceClass = scRaw as CardData["serviceClass"];
    }

    const mwRaw = (c as { matrixWeight?: unknown }).matrixWeight;
    if (typeof mwRaw === "number" && Number.isFinite(mwRaw)) {
      base.matrixWeight = Math.max(0, Math.min(100, mwRaw));
    }

    const MATRIX_BANDS = ["low", "medium", "high", "critical"] as const;
    const mwbRaw = (c as { matrixWeightBand?: unknown }).matrixWeightBand;
    if (typeof mwbRaw === "string" && (MATRIX_BANDS as readonly string[]).includes(mwbRaw)) {
      base.matrixWeightBand = mwbRaw as CardData["matrixWeightBand"];
    }

    return base as unknown as CardData;
  });

  const bucketOrder = bucketOrderRaw.length > 0 ? bucketOrderRaw : [{ key: "Backlog", label: "Backlog", color: "var(--flux-primary)" }];

  const intakeForm = sanitizeIntakeFormForPut(db.intakeForm);

  const productGoalRaw = db.config?.productGoal;
  const productGoal =
    typeof productGoalRaw === "string" && productGoalRaw.trim()
      ? productGoalRaw.trim().slice(0, 800)
      : undefined;
  const backlogKeyRaw = db.config?.backlogBucketKey;
  const backlogBucketKey =
    typeof backlogKeyRaw === "string" &&
    backlogKeyRaw.trim() &&
    bucketOrder.some((b) => b.key === backlogKeyRaw.trim())
      ? backlogKeyRaw.trim().slice(0, 200)
      : undefined;
  let definitionOfDone: BoardDefinitionOfDone | undefined;
  const defRaw = db.config?.definitionOfDone;
  if (defRaw && typeof defRaw === "object") {
    const enabled = defRaw.enabled === true;
    const enforce = defRaw.enforce === true;
    const items = Array.isArray(defRaw.items)
      ? defRaw.items
          .filter((it): it is { id: string; label: string } => Boolean(it && typeof it === "object"))
          .map((it) => ({
            id: String((it as { id?: string }).id ?? "")
              .trim()
              .slice(0, 80),
            label: String((it as { label?: string }).label ?? "")
              .trim()
              .slice(0, 300),
          }))
          .filter((it) => it.id && it.label)
          .slice(0, 20)
      : [];
    const dkRaw = defRaw.doneBucketKeys;
    const doneBucketKeys =
      Array.isArray(dkRaw) && dkRaw.length > 0
        ? [...new Set(dkRaw.map((k) => String(k).trim().slice(0, 200)).filter((k) => bucketKeys.has(k)))].slice(
            0,
            20
          )
        : undefined;
    if (enabled || items.length > 0 || (doneBucketKeys?.length ?? 0) > 0) {
      definitionOfDone = {
        enabled,
        enforce,
        ...(doneBucketKeys?.length ? { doneBucketKeys } : {}),
        items,
      };
    }
  }

  const wipRaw = (db.config as { wipEnforcement?: unknown } | undefined)?.wipEnforcement;
  const wipEnforcement = wipRaw === "soft" || wipRaw === "strict" ? wipRaw : undefined;

  const sipRaw = (db.config as { sipocDraft?: unknown } | undefined)?.sipocDraft;
  let sipocDraft: Record<string, string> | undefined;
  if (sipRaw && typeof sipRaw === "object") {
    const p = SipocDraftSchema.safeParse(sipRaw);
    if (p.success) {
      const o = p.data as Record<string, string | undefined>;
      sipocDraft = {};
      for (const k of ["suppliers", "inputs", "process", "outputs", "customers"] as const) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) sipocDraft[k] = v.trim().slice(0, 2000);
      }
      if (Object.keys(sipocDraft).length === 0) sipocDraft = undefined;
    }
  }

  const bmRaw = (db as { boardMethodology?: unknown }).boardMethodology;
  const boardMethodology =
    bmRaw === "scrum" || bmRaw === "kanban" || bmRaw === "lean_six_sigma" ? bmRaw : undefined;
  const { boardMethodology: _omitBm, ...dbWithoutBm } = db as BoardData & { boardMethodology?: unknown };

  const result = {
    ...dbWithoutBm,
    ...(boardMethodology ? { boardMethodology } : {}),
    cards,
    config: {
      ...db.config,
      bucketOrder,
      collapsedColumns: (db.config?.collapsedColumns ?? [])
        .map((k) => String(k).trim().slice(0, 200))
        .filter((k) => bucketOrder.some((b) => b.key === k)),
      labels: normalizedLabels,
      ...(productGoal ? { productGoal } : {}),
      ...(backlogBucketKey ? { backlogBucketKey } : {}),
      ...(definitionOfDone ? { definitionOfDone } : {}),
      ...(wipEnforcement ? { wipEnforcement } : {}),
      ...(sipocDraft ? { sipocDraft } : {}),
    },
    ...(intakeForm !== undefined ? { intakeForm } : {}),
  } as BoardData;

  if (result.portal === null) {
    delete (result as unknown as Record<string, unknown>).portal;
  } else if (result.portal !== undefined && typeof result.portal === "object") {
    result.portal = sanitizePortalForPut(result.portal);
  }

  if (Array.isArray(result.dailyInsights)) {
    result.dailyInsights = result.dailyInsights.filter((e) => DailyInsightEntrySchema.safeParse(e).success);
  }

  if (
    result.anomalyNotifications &&
    typeof result.anomalyNotifications === "object" &&
    !Array.isArray(result.anomalyNotifications)
  ) {
    result.anomalyNotifications = omitEntryNulls(
      result.anomalyNotifications as unknown as Record<string, unknown>
    ) as BoardData["anomalyNotifications"];
  }

  if (Array.isArray(result.mapaProducao)) {
    result.mapaProducao = result.mapaProducao
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const coerced = {
          ...o,
          papel: String(o.papel ?? "").trim().slice(0, 200),
          equipe: String(o.equipe ?? "").trim().slice(0, 200),
          linha: String(o.linha ?? "").trim().slice(0, 200),
          operacoes: String(o.operacoes ?? "").trim().slice(0, 4000),
        };
        return MapaProducaoItemSchema.safeParse(coerced).success ? coerced : null;
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  if (result.version === null) {
    delete (result as unknown as Record<string, unknown>).version;
  }

  return result;
}
