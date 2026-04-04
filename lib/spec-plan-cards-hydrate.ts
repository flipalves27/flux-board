import "server-only";

import type { z } from "zod";
import { CardMappingSlimRowSchema, WorkItemsLlmSchema } from "@/lib/spec-plan-schemas";

type WorkItem = z.infer<typeof WorkItemsLlmSchema>["items"][number];
type SlimRow = z.infer<typeof CardMappingSlimRowSchema>;

const TITLE_MAX = 300;
const DESC_MAX = 6000;
const BUCKET_RATIONALE_MAX = 280;
const RATIONALE_MAX = 600;
const WHY_MAX = 400;
const TAGS_MAX = 30;
const BLOCKED_MAX = 50;
const SUBTASKS_MAX = 12;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

const VALID_PRIORITIES = new Set(["Urgente", "Importante", "Média"]);

function normalizePriority(p: string): string {
  const t = p.trim();
  if (VALID_PRIORITIES.has(t)) return t;
  return "Média";
}

/**
 * Dedupe por workItemId (mantém a primeira ocorrência).
 */
export function dedupeSlimCardRows(rows: SlimRow[]): SlimRow[] {
  const seen = new Set<string>();
  const out: SlimRow[] = [];
  for (const r of rows) {
    const id = String(r.workItemId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export type HydratedCardRow = {
  workItemId: string;
  title: string;
  desc: string;
  bucketKey: string;
  bucketRationale: string;
  priority: string;
  progress: string;
  tags: string[];
  storyPoints: number | null | undefined;
  serviceClass: "expedite" | "fixed_date" | "standard" | "intangible" | null | undefined;
  rationale: string;
  blockedByTitles: string[];
  subtasks: { title: string; status: "pending" | "in_progress" | "done" | "blocked" }[];
};

export type BucketMappingRow = { workItemId: string; bucketKey: string; why: string };

export function hydrateSpecPlanCardRows(input: {
  workItems: WorkItem[];
  slimRows: SlimRow[];
  allowSubtasks: boolean;
}): { cardRows: HydratedCardRow[]; bucketMappingRows: BucketMappingRow[] } {
  const byId = new Map<string, WorkItem>();
  for (const it of input.workItems) {
    byId.set(String(it.id), it);
  }

  const deduped = dedupeSlimCardRows(input.slimRows);
  const cardRows: HydratedCardRow[] = [];
  const bucketMappingRows: BucketMappingRow[] = [];

  for (const row of deduped) {
    const wi = byId.get(String(row.workItemId));
    if (!wi) continue;

    const subtasksRaw = input.allowSubtasks ? row.subtasks ?? [] : [];
    const subtasks = subtasksRaw
      .map((s) => ({
        title: clip(String(s.title || ""), 300),
        status: (s.status ?? "pending") as HydratedCardRow["subtasks"][number]["status"],
      }))
      .filter((s) => s.title)
      .slice(0, SUBTASKS_MAX);

    const bucketRationale = clip(String(row.bucketRationale || ""), BUCKET_RATIONALE_MAX);
    const rationale = clip(String(row.rationale || ""), RATIONALE_MAX);

    const hydrated: HydratedCardRow = {
      workItemId: String(row.workItemId),
      title: clip(String(wi.title || ""), TITLE_MAX),
      desc: clip(String(wi.description || ""), DESC_MAX),
      bucketKey: String(row.bucketKey || ""),
      bucketRationale,
      priority: normalizePriority(String(row.priority || "")),
      progress: "Não iniciado",
      tags: (row.tags ?? []).map((t) => clip(String(t), 80)).filter(Boolean).slice(0, TAGS_MAX),
      storyPoints: typeof row.storyPoints === "number" ? row.storyPoints : null,
      serviceClass: row.serviceClass ?? null,
      rationale,
      blockedByTitles: (row.blockedByTitles ?? [])
        .map((x) => String(x))
        .filter(Boolean)
        .slice(0, BLOCKED_MAX),
      subtasks,
    };

    cardRows.push(hydrated);
    bucketMappingRows.push({
      workItemId: hydrated.workItemId,
      bucketKey: hydrated.bucketKey,
      why: clip(bucketRationale, WHY_MAX),
    });
  }

  return { cardRows, bucketMappingRows };
}
