import { getDb, isMongoConfigured } from "@/lib/mongo";
import type { Db } from "mongodb";

export type AgentRunStatus = "pending" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";

export type AgentRunDoc = {
  id: string;
  orgId: string;
  boardId?: string;
  agentKind: string;
  status: AgentRunStatus;
  autonomyLevel: 1 | 2 | 3 | 4;
  createdAt: string;
  updatedAt: string;
  rationale?: string;
  auditTrail?: Array<{ at: string; step: string; detail?: string; isAiAction?: boolean }>;
};

const COL = "agent_runs";

let indexes = false;

async function ensure(db: Db): Promise<void> {
  if (indexes) return;
  await db.collection(COL).createIndex({ orgId: 1, updatedAt: -1 });
  await db.collection(COL).createIndex({ orgId: 1, status: 1 });
  indexes = true;
}

function mkId(): string {
  return `ar_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export async function createAgentRun(params: {
  orgId: string;
  boardId?: string;
  agentKind: string;
  autonomyLevel?: 1 | 2 | 3 | 4;
  rationale?: string;
}): Promise<AgentRunDoc | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  await ensure(db);
  const now = new Date().toISOString();
  const doc: AgentRunDoc = {
    id: mkId(),
    orgId: params.orgId,
    boardId: params.boardId,
    agentKind: params.agentKind,
    status: "pending",
    autonomyLevel: params.autonomyLevel ?? 1,
    createdAt: now,
    updatedAt: now,
    ...(params.rationale ? { rationale: params.rationale } : {}),
    auditTrail: [{ at: now, step: "created", isAiAction: false }],
  };
  await db.collection(COL).insertOne(doc as Record<string, unknown>);
  return doc;
}

export async function listAgentRunsForOrg(orgId: string, limit = 20): Promise<AgentRunDoc[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  await ensure(db);
  const rows = await db
    .collection<AgentRunDoc>(COL)
    .find({ orgId })
    .sort({ updatedAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .toArray();
  return rows;
}
