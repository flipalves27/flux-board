import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";
import type { CommentData } from "./schemas";

export type { CommentData };

const COL_COMMENTS = "card_comments";

function kvKey(orgId: string, cardId: string, commentId: string): string {
  return `comment:${orgId}:${cardId}:${commentId}`;
}

function kvIndex(orgId: string, boardId: string, cardId: string): string {
  return `comments_index:${orgId}:${boardId}:${cardId}`;
}

function mkId(): string {
  return `cmt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let idxEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (idxEnsured) return;
  await db.collection(COL_COMMENTS).createIndex({ orgId: 1, boardId: 1, cardId: 1 });
  await db.collection(COL_COMMENTS).createIndex({ createdAt: 1 });
  idxEnsured = true;
}

export async function listComments(orgId: string, boardId: string, cardId: string): Promise<CommentData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const docs = await db.collection<CommentData>(COL_COMMENTS).find({ orgId, boardId, cardId } as any).toArray();
    docs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return docs;
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndex(orgId, boardId, cardId))) as string[]) || [];
  const out: CommentData[] = [];
  for (const id of ids) {
    const c = await store.get<CommentData>(kvKey(orgId, cardId, id));
    if (c) out.push(c);
  }
  out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return out;
}

export async function createComment(params: {
  orgId: string;
  boardId: string;
  cardId: string;
  authorId: string;
  body: string;
  parentCommentId?: string | null;
  mentions?: string[];
  isAiGenerated?: boolean;
}): Promise<CommentData> {
  const now = new Date().toISOString();
  const id = mkId();
  const comment: CommentData = {
    id,
    cardId: params.cardId,
    boardId: params.boardId,
    orgId: params.orgId,
    authorId: params.authorId,
    body: sanitizeText(params.body).trim().slice(0, 2000),
    parentCommentId: params.parentCommentId ?? null,
    reactions: [],
    mentions: params.mentions ?? [],
    isAiGenerated: params.isAiGenerated ?? false,
    createdAt: now,
    editedAt: null,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection(COL_COMMENTS).insertOne(comment as any);
    return comment;
  }

  const store = await getStore();
  await store.set(kvKey(params.orgId, params.cardId, id), comment);
  const ids = ((await store.get<string[]>(kvIndex(params.orgId, params.boardId, params.cardId))) as string[]) || [];
  if (!ids.includes(id)) {
    ids.push(id);
    await store.set(kvIndex(params.orgId, params.boardId, params.cardId), ids);
  }
  return comment;
}

export async function deleteComment(orgId: string, boardId: string, cardId: string, commentId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const res = await db.collection(COL_COMMENTS).deleteOne({ orgId, id: commentId } as any);
    return res.deletedCount > 0;
  }
  const store = await getStore();
  const existing = await store.get<CommentData>(kvKey(orgId, cardId, commentId));
  if (!existing) return false;
  await store.del(kvKey(orgId, cardId, commentId));
  const ids = ((await store.get<string[]>(kvIndex(orgId, boardId, cardId))) as string[]) || [];
  await store.set(kvIndex(orgId, boardId, cardId), ids.filter((id) => id !== commentId));
  return true;
}

export async function addReaction(orgId: string, cardId: string, commentId: string, emoji: string, userId: string): Promise<CommentData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const comment = await db.collection<CommentData>(COL_COMMENTS).findOne({ orgId, id: commentId } as any);
    if (!comment) return null;
    const reactions = comment.reactions ?? [];
    const existing = reactions.findIndex((r) => r.emoji === emoji && r.userId === userId);
    if (existing >= 0) {
      reactions.splice(existing, 1);
    } else {
      reactions.push({ emoji, userId });
    }
    await db.collection(COL_COMMENTS).updateOne({ orgId, id: commentId } as any, { $set: { reactions } });
    return { ...comment, reactions };
  }
  const store = await getStore();
  const comment = await store.get<CommentData>(kvKey(orgId, cardId, commentId));
  if (!comment) return null;
  const reactions = comment.reactions ?? [];
  const existing = reactions.findIndex((r) => r.emoji === emoji && r.userId === userId);
  if (existing >= 0) reactions.splice(existing, 1);
  else reactions.push({ emoji, userId });
  const updated = { ...comment, reactions };
  await store.set(kvKey(orgId, cardId, commentId), updated);
  return updated;
}
