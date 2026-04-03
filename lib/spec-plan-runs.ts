import "server-only";

import { ObjectId, type Db } from "mongodb";
import type { SpecPlanMethodology } from "@/lib/spec-plan-schemas";
import type {
  SpecPlanDocReadMeta,
  SpecPlanPhaseKey,
  SpecPlanPhaseState,
  SpecPlanPreviewRow,
  SpecPlanRunLogEntry,
  SpecPlanRunStatus,
} from "@/lib/spec-plan-run-types";
import { getDb, isMongoConfigured } from "@/lib/mongo";

export const SPEC_PLAN_RUNS_COLLECTION = "spec_plan_runs";
export const SPEC_PLAN_RUN_SCHEMA = "flux-board.spec_plan_run.v1" as const;

const MAX_PREVIEW_ROWS = 250;
const MAX_WORK_ITEMS_PAYLOAD_CHARS = 900_000;

export type SpecPlanRunDocument = {
  _id: ObjectId;
  schema: typeof SPEC_PLAN_RUN_SCHEMA;
  orgId: string;
  boardId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: SpecPlanRunStatus;
  methodology: SpecPlanMethodology;
  remapOnly: boolean;
  sourceSummary: string;
  phases: Record<SpecPlanPhaseKey, SpecPlanPhaseState>;
  logs: SpecPlanRunLogEntry[];
  docReadMeta: SpecPlanDocReadMeta | null;
  outlineSummary: string | null;
  methodologySummary: string | null;
  workItemsPayload: string;
  preview: SpecPlanPreviewRow[];
  streamError: string | null;
  streamErrorDetail: string | null;
  cancelRequested?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function trimPayload(s: string): string {
  if (s.length <= MAX_WORK_ITEMS_PAYLOAD_CHARS) return s;
  return s.slice(0, MAX_WORK_ITEMS_PAYLOAD_CHARS) + "\n…[truncado para armazenamento]";
}

function trimPreview(rows: SpecPlanPreviewRow[]): SpecPlanPreviewRow[] {
  return rows.slice(0, MAX_PREVIEW_ROWS);
}

let specPlanRunIndexesEnsured = false;

export async function insertSpecPlanRun(args: {
  orgId: string;
  boardId: string;
  userId: string;
  status: SpecPlanRunStatus;
  methodology: SpecPlanMethodology;
  remapOnly: boolean;
  sourceSummary: string;
  phases: Record<SpecPlanPhaseKey, SpecPlanPhaseState>;
  logs: SpecPlanRunLogEntry[];
  docReadMeta: SpecPlanDocReadMeta | null;
  outlineSummary: string | null;
  methodologySummary: string | null;
  workItemsPayload: string;
  preview: SpecPlanPreviewRow[];
  streamError: string | null;
  streamErrorDetail: string | null;
}): Promise<ObjectId | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  if (!specPlanRunIndexesEnsured) {
    specPlanRunIndexesEnsured = true;
    await ensureSpecPlanRunsIndexes(db);
  }
  const t = nowIso();
  const doc: Omit<SpecPlanRunDocument, "_id"> = {
    schema: SPEC_PLAN_RUN_SCHEMA,
    orgId: args.orgId,
    boardId: args.boardId,
    userId: args.userId,
    createdAt: t,
    updatedAt: t,
    status: args.status,
    methodology: args.methodology,
    remapOnly: args.remapOnly,
    sourceSummary: args.sourceSummary.slice(0, 500),
    phases: args.phases,
    logs: args.logs,
    docReadMeta: args.docReadMeta,
    outlineSummary: args.outlineSummary,
    methodologySummary: args.methodologySummary,
    workItemsPayload: trimPayload(args.workItemsPayload),
    preview: trimPreview(args.preview),
    streamError: args.streamError,
    streamErrorDetail: args.streamErrorDetail ? args.streamErrorDetail.slice(0, 12000) : null,
  };
  const res = await db.collection(SPEC_PLAN_RUNS_COLLECTION).insertOne(doc);
  return res.insertedId;
}

export async function updateSpecPlanRun(
  runId: ObjectId,
  orgId: string,
  patch: Partial<
    Pick<
      SpecPlanRunDocument,
      | "status"
      | "phases"
      | "logs"
      | "docReadMeta"
      | "outlineSummary"
      | "methodologySummary"
      | "workItemsPayload"
      | "preview"
      | "streamError"
      | "streamErrorDetail"
      | "cancelRequested"
    >
  >
): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const db = await getDb();
  const set: Record<string, unknown> = { ...patch, updatedAt: nowIso() };
  if (patch.workItemsPayload != null) set.workItemsPayload = trimPayload(patch.workItemsPayload);
  if (patch.preview != null) set.preview = trimPreview(patch.preview);
  if (patch.streamErrorDetail != null && typeof patch.streamErrorDetail === "string") {
    set.streamErrorDetail = patch.streamErrorDetail.slice(0, 12000);
  }
  const r = await db.collection(SPEC_PLAN_RUNS_COLLECTION).updateOne(
    { _id: runId, orgId },
    { $set: set }
  );
  return r.matchedCount > 0;
}

export async function getSpecPlanRun(runId: string, orgId: string): Promise<SpecPlanRunDocument | null> {
  if (!isMongoConfigured()) return null;
  if (!ObjectId.isValid(runId)) return null;
  const db = await getDb();
  const doc = await db.collection<SpecPlanRunDocument>(SPEC_PLAN_RUNS_COLLECTION).findOne({
    _id: new ObjectId(runId),
    orgId,
  });
  return doc ?? null;
}

export async function listSpecPlanRuns(args: {
  orgId: string;
  boardId: string;
  userId?: string;
  limit?: number;
}): Promise<SpecPlanRunDocument[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  const limit = Math.min(100, Math.max(1, args.limit ?? 40));
  const filter: Record<string, unknown> = { orgId: args.orgId, boardId: args.boardId };
  if (args.userId) filter.userId = args.userId;
  const cursor = db
    .collection<SpecPlanRunDocument>(SPEC_PLAN_RUNS_COLLECTION)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);
  return cursor.toArray();
}

export async function deleteSpecPlanRun(runId: string, orgId: string, userId: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  if (!ObjectId.isValid(runId)) return false;
  const db = await getDb();
  const r = await db.collection(SPEC_PLAN_RUNS_COLLECTION).deleteOne({
    _id: new ObjectId(runId),
    orgId,
    userId,
  });
  return r.deletedCount > 0;
}

export async function userHasActiveSpecPlanRunOnBoard(
  orgId: string,
  userId: string,
  boardId: string
): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const db = await getDb();
  const doc = await db.collection<SpecPlanRunDocument>(SPEC_PLAN_RUNS_COLLECTION).findOne(
    {
      orgId,
      userId,
      boardId,
      status: { $in: ["queued", "running"] as SpecPlanRunStatus[] },
    },
    { projection: { _id: 1 } }
  );
  return doc != null;
}

export async function listActiveSpecPlanRunsForUser(orgId: string, userId: string): Promise<
  { runId: string; boardId: string; status: SpecPlanRunStatus; updatedAt: string }[]
> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  const rows = await db
    .collection<SpecPlanRunDocument>(SPEC_PLAN_RUNS_COLLECTION)
    .find({
      orgId,
      userId,
      status: { $in: ["queued", "running"] as SpecPlanRunStatus[] },
    })
    .project({ boardId: 1, status: 1, updatedAt: 1 })
    .limit(20)
    .toArray();
  return rows.map((r) => ({
    runId: r._id.toHexString(),
    boardId: r.boardId,
    status: r.status,
    updatedAt: r.updatedAt,
  }));
}

export async function getSpecPlanRunCancelRequested(runId: ObjectId, orgId: string): Promise<boolean> {
  if (!isMongoConfigured()) return false;
  const db = await getDb();
  const doc = await db.collection<SpecPlanRunDocument>(SPEC_PLAN_RUNS_COLLECTION).findOne(
    { _id: runId, orgId },
    { projection: { cancelRequested: 1 } }
  );
  return Boolean(doc?.cancelRequested);
}

export async function ensureSpecPlanRunsIndexes(db: Db): Promise<void> {
  try {
    await db.collection(SPEC_PLAN_RUNS_COLLECTION).createIndexes([
      { key: { orgId: 1, boardId: 1, createdAt: -1 }, name: "spec_plan_org_board_created" },
      { key: { orgId: 1, userId: 1, status: 1 }, name: "spec_plan_org_user_status" },
    ]);
  } catch (e) {
    console.warn("[spec-plan-runs] createIndexes", e);
  }
}
