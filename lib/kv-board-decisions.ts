import { getDb, isMongoConfigured } from "@/lib/mongo";
import { sanitizeText } from "@/lib/schemas";

const COL = "flux_board_decisions";

export type BoardDecisionRecord = {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  context: string;
  decision: string;
  alternatives: Array<{ option: string; reason_rejected: string }>;
  consequences: string;
  status: "active" | "superseded" | "reverted";
  authorId: string;
  relatedCardIds: string[];
  tags: string[];
  createdAt: string;
};

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ orgId: 1, boardId: 1, createdAt: -1 });
  indexesEnsured = true;
}

export async function listBoardDecisions(orgId: string, boardId: string, limit = 80): Promise<BoardDecisionRecord[]> {
  if (!isMongoConfigured()) return [];
  await ensureIndexes();
  const db = await getDb();
  const docs = await db
    .collection(COL)
    .find({ orgId, boardId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => {
    const rec = d as unknown as BoardDecisionRecord & { _id?: string };
    return { ...rec, id: rec.id ?? String(rec._id ?? "") };
  });
}

export async function insertBoardDecision(params: {
  orgId: string;
  boardId: string;
  authorId: string;
  title: string;
  context?: string;
  decision: string;
  alternatives?: BoardDecisionRecord["alternatives"];
  consequences?: string;
  relatedCardIds?: string[];
  tags?: string[];
}): Promise<BoardDecisionRecord> {
  await ensureIndexes();
  const db = await getDb();
  const id = `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const rec: BoardDecisionRecord = {
    id,
    orgId: params.orgId,
    boardId: params.boardId,
    title: sanitizeText(params.title).trim().slice(0, 200),
    context: sanitizeText(params.context ?? "").trim().slice(0, 4000),
    decision: sanitizeText(params.decision).trim().slice(0, 4000),
    alternatives: Array.isArray(params.alternatives) ? params.alternatives.slice(0, 20) : [],
    consequences: sanitizeText(params.consequences ?? "").trim().slice(0, 2000),
    status: "active",
    authorId: params.authorId,
    relatedCardIds: (params.relatedCardIds ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 50),
    tags: (params.tags ?? []).map((t) => sanitizeText(t).trim()).filter(Boolean).slice(0, 30),
    createdAt: new Date().toISOString(),
  };
  await db.collection(COL).insertOne({ ...rec, _id: rec.id } as Record<string, unknown>);
  return rec;
}

export function findSimilarDecisionsByText(query: string, decisions: BoardDecisionRecord[], limit = 4): BoardDecisionRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length > 2).slice(0, 12);
  if (!terms.length) return [];

  const scored = decisions.map((d) => {
    const hay = `${d.title} ${d.context} ${d.decision} ${d.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
    }
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.d);
}
