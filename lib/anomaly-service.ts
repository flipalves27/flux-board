import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { BoardData } from "@/lib/kv-boards";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  averageLeadTimeDays,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import {
  collectBucketLabelsForBoards,
  computeWipByBucket,
  countDueWithinDays,
  detectLeadTimeSpike,
  detectOkrDrift,
  detectOverdueCascade,
  detectStagnation,
  detectThroughputDrop,
  detectWipExplosionForBoard,
  type AnomalyAlertPayload,
  type WipByBucket,
} from "@/lib/anomaly-detection";
import { loadOkrProjectionsForOrgQuarter } from "@/lib/okr-projection-org";
import { canUseFeature } from "@/lib/plan-gates";
import { getOrganizationById, type Organization } from "@/lib/kv-organizations";

export const COL_ANOMALY_SNAPSHOTS = "anomaly_daily_snapshots";
export const COL_ANOMALY_RUNS = "anomaly_check_runs";
export const COL_ANOMALY_ALERTS = "anomaly_alerts";

const ORG_ROLLUP_ID = "__org__";

let indexesEnsured = false;

async function ensureAnomalyIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL_ANOMALY_SNAPSHOTS).createIndex({ orgId: 1, boardId: 1, day: 1 }, { unique: true });
  await db.collection(COL_ANOMALY_RUNS).createIndex({ orgId: 1, runAt: -1 });
  await db.collection(COL_ANOMALY_ALERTS).createIndex({ orgId: 1, read: 1, createdAt: -1 });
  indexesEnsured = true;
}

export async function listBoardsForOrgMongo(orgId: string, db: Db): Promise<BoardData[]> {
  const docs = await db.collection("boards").find({ orgId }).toArray();
  return docs
    .map((doc) => {
      const id = doc?._id;
      if (!id || !doc) return null;
      const { _id, ...rest } = doc as Record<string, unknown> & { _id: unknown };
      return { ...rest, id: String(id) } as BoardData;
    })
    .filter(Boolean) as BoardData[];
}

function dayKeyUtc(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

async function loadWipHistoryForBoard(
  db: Db,
  orgId: string,
  boardId: string,
  beforeDay: string,
  limit: number
): Promise<WipByBucket[]> {
  const rows = await db
    .collection<{ wipByBucket?: WipByBucket }>(COL_ANOMALY_SNAPSHOTS)
    .find({ orgId, boardId, day: { $lt: beforeDay } })
    .sort({ day: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => r.wipByBucket ?? {}).reverse();
}

async function loadOrgLeadAndDueHistory(
  db: Db,
  orgId: string,
  beforeDay: string,
  limit: number
): Promise<{ lead: number[]; dueSoon: number[] }> {
  const rows = await db
    .collection<{ avgLeadTimeDays?: number | null; dueSoon3dCount?: number }>(COL_ANOMALY_SNAPSHOTS)
    .find({ orgId, boardId: ORG_ROLLUP_ID, day: { $lt: beforeDay } })
    .sort({ day: -1 })
    .limit(limit)
    .toArray();
  const rev = rows.reverse();
  return {
    lead: rev.map((r) => (typeof r.avgLeadTimeDays === "number" ? r.avgLeadTimeDays : 0)).filter((x) => x > 0),
    dueSoon: rev.map((r) => (typeof r.dueSoon3dCount === "number" ? r.dueSoon3dCount : 0)),
  };
}

async function upsertDailySnapshots(args: {
  db: Db;
  orgId: string;
  day: string;
  boards: BoardData[];
  todayMs: number;
}): Promise<void> {
  const { db, orgId, day, boards, todayMs } = args;
  const leadOrg = averageLeadTimeDays(boards);
  const dueOrg = countDueWithinDays(boards, 3, todayMs);

  await db.collection(COL_ANOMALY_SNAPSHOTS).updateOne(
    { orgId, boardId: ORG_ROLLUP_ID, day },
    {
      $set: {
        orgId,
        boardId: ORG_ROLLUP_ID,
        day,
        avgLeadTimeDays: leadOrg,
        dueSoon3dCount: dueOrg,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  for (const b of boards) {
    const wip = computeWipByBucket(b);
    const dueB = countDueWithinDays([b], 3, todayMs);
    const leadB = averageLeadTimeDays([b]);
    await db.collection(COL_ANOMALY_SNAPSHOTS).updateOne(
      { orgId, boardId: b.id, day },
      {
        $set: {
          orgId,
          boardId: b.id,
          day,
          wipByBucket: wip,
          avgLeadTimeDays: leadB,
          dueSoon3dCount: dueB,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }
}

export type AnomalyRunResult = {
  orgId: string;
  runAt: string;
  alertCount: number;
  skipped?: string;
};

async function persistRunAndAlerts(
  db: Db,
  orgId: string,
  runAt: string,
  alerts: AnomalyAlertPayload[]
): Promise<void> {
  const runId = new ObjectId();
  await db.collection(COL_ANOMALY_RUNS).insertOne({
    _id: runId,
    orgId,
    runAt,
    alertCount: alerts.length,
    alerts,
    schema: "flux-board.anomaly_run.v1",
  });

  if (!alerts.length) return;

  const docs = alerts.map((a) => ({
    orgId,
    runId: runId.toHexString(),
    kind: a.kind,
    severity: a.severity,
    title: a.title,
    message: a.message,
    diagnostics: a.diagnostics,
    boardId: a.boardId,
    boardName: a.boardName,
    read: false,
    createdAt: runAt,
  }));
  await db.collection(COL_ANOMALY_ALERTS).insertMany(docs);
}

export async function runAnomalyCheckForOrg(args: {
  orgId: string;
  org: Organization | null;
  nowMs: number;
  db: Db;
}): Promise<AnomalyRunResult> {
  const { orgId, org, nowMs, db } = args;
  await ensureAnomalyIndexes(db);

  if (org && !canUseFeature(org, "portfolio_export")) {
    return { orgId, runAt: new Date(nowMs).toISOString(), alertCount: 0, skipped: "plan" };
  }

  const boards = await listBoardsForOrgMongo(orgId, db);
  if (!boards.length) {
    return { orgId, runAt: new Date(nowMs).toISOString(), alertCount: 0, skipped: "no_boards" };
  }

  const boardIds = boards.map((b) => b.id).filter(Boolean);
  const day = dayKeyUtc(nowMs);

  const weeksStart = nowMs - 8 * 7 * 24 * 60 * 60 * 1000;
  const prevStartIso = new Date(weeksStart).toISOString();

  let copilotChats: CopilotChatDocLike[] = [];
  copilotChats = (await db
    .collection("board_copilot_chats")
    .find({ orgId, boardId: { $in: boardIds }, updatedAt: { $gte: prevStartIso } })
    .toArray()) as CopilotChatDocLike[];

  const { lead: historyLead, dueSoon: historyDue } = await loadOrgLeadAndDueHistory(db, orgId, day, 20);
  const bucketLabels = collectBucketLabelsForBoards(boards);

  const alerts: AnomalyAlertPayload[] = [];

  const t1 = detectThroughputDrop({ copilotChats, boardIds, nowMs });
  if (t1) alerts.push(t1);

  const lt = detectLeadTimeSpike({ boards, historyLeadAvgs: historyLead });
  if (lt) alerts.push(lt);

  const oc = detectOverdueCascade({ boards, todayMs: nowMs, historyDueSoonCounts: historyDue });
  if (oc) alerts.push(oc);

  for (const board of boards) {
    const wipHist = await loadWipHistoryForBoard(db, orgId, board.id, day, 14);
    const w = detectWipExplosionForBoard({ board, bucketLabels, historyForBoard: wipHist });
    if (w) alerts.push(w);

    const s = detectStagnation(board, nowMs);
    if (s) alerts.push(s);
  }

  const quarter = currentQuarterLabel();
  const okrProj = await loadOkrProjectionsForOrgQuarter({ orgId, quarter, boards, nowMs });
  alerts.push(...detectOkrDrift(okrProj).slice(0, 8));

  await upsertDailySnapshots({ db, orgId, day, boards, todayMs: nowMs });

  const runAt = new Date(nowMs).toISOString();
  await persistRunAndAlerts(db, orgId, runAt, alerts);

  return { orgId, runAt, alertCount: alerts.length };
}

function currentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

export async function runAnomalyCheckAllOrgs(nowMs: number): Promise<{
  processedOrgs: number;
  totalAlerts: number;
  results: AnomalyRunResult[];
}> {
  if (!isMongoConfigured()) {
    return { processedOrgs: 0, totalAlerts: 0, results: [] };
  }
  const db = await getDb();
  await ensureAnomalyIndexes(db);

  const orgIds = (await db.collection("boards").distinct("orgId")) as string[];

  const results: AnomalyRunResult[] = [];
  let totalAlerts = 0;

  for (const orgId of orgIds) {
    if (!orgId) continue;
    try {
      const org = await getOrganizationById(orgId);
      const r = await runAnomalyCheckForOrg({ orgId, org, nowMs, db });
      results.push(r);
      totalAlerts += r.alertCount;
    } catch (e) {
      console.error("[anomaly-check] org", orgId, e);
      results.push({
        orgId,
        runAt: new Date(nowMs).toISOString(),
        alertCount: 0,
        skipped: "error",
      });
    }
  }

  return { processedOrgs: results.length, totalAlerts, results };
}
