import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";

const COL_AUTOMATION_LOGS = "board_automation_logs";
const KV_AUTOMATION_LOGS_PREFIX = "flux_board_automation_logs:";
const MAX_LOGS_PER_BOARD = 200;

export type AutomationExecutionLog = {
  _id: string;
  orgId: string;
  boardId: string;
  ruleId: string;
  triggerType: string;
  actionType: string;
  cardId?: string | null;
  status: "success" | "simulated" | "failed";
  message?: string | null;
  executedAt: string;
};

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

export async function appendAutomationExecutionLog(
  input: Omit<AutomationExecutionLog, "_id" | "executedAt">
): Promise<void> {
  const log: AutomationExecutionLog = {
    _id: mkId("alog"),
    executedAt: new Date().toISOString(),
    ...input,
  };

  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_AUTOMATION_LOGS_PREFIX}${input.boardId}`;
    const current = (await store.get<AutomationExecutionLog[]>(key)) ?? [];
    await store.set(key, [log, ...current].slice(0, MAX_LOGS_PER_BOARD));
    return;
  }

  const db = await getDb();
  await db.collection<AutomationExecutionLog>(COL_AUTOMATION_LOGS).insertOne(log);
  const over = await db
    .collection<AutomationExecutionLog>(COL_AUTOMATION_LOGS)
    .find({ boardId: input.boardId, orgId: input.orgId })
    .sort({ executedAt: -1 })
    .skip(MAX_LOGS_PER_BOARD)
    .project({ _id: 1 })
    .toArray();
  if (over.length > 0) {
    await db.collection(COL_AUTOMATION_LOGS).deleteMany({ _id: { $in: over.map((x) => x._id) } });
  }
}

export async function listAutomationExecutionLogs(params: {
  boardId: string;
  orgId: string;
  limit?: number;
}): Promise<AutomationExecutionLog[]> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_AUTOMATION_LOGS_PREFIX}${params.boardId}`;
    const current = (await store.get<AutomationExecutionLog[]>(key)) ?? [];
    return current.filter((x) => x.orgId === params.orgId).slice(0, limit);
  }
  const db = await getDb();
  return db
    .collection<AutomationExecutionLog>(COL_AUTOMATION_LOGS)
    .find({ boardId: params.boardId, orgId: params.orgId })
    .sort({ executedAt: -1 })
    .limit(limit)
    .toArray();
}

