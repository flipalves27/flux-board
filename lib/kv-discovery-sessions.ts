import { createHash, randomBytes } from "crypto";
import type { Db } from "mongodb";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { getStore } from "@/lib/storage";
import { defaultDiscoveryFormDefinition } from "@/lib/discovery-session-defaults";

const COL = "discovery_sessions";
const KV_PREFIX = "flux_discovery_session:";
const KV_TOKEN_PREFIX = "flux_discovery_token:";
const KV_BOARD_INDEX = "flux_discovery_by_board:";
const COUNTER_ID = "discovery_session";

export type DiscoverySessionStatus = "draft" | "open" | "submitted" | "processed" | "archived";

export type DiscoveryFormField = {
  id: string;
  label: string;
  type: "textarea";
  maxLength: number;
  placeholder?: string;
};

export type DiscoveryFormBlock = {
  id: string;
  title: string;
  fields: DiscoveryFormField[];
};

export type DiscoveryFormDefinition = {
  version: number;
  blocks: DiscoveryFormBlock[];
};

export type DiscoveryCardDraft = {
  title: string;
  description: string;
  bucketKey: string;
  priority: string;
  dueDate?: string | null;
  tags?: string[];
};

export interface DiscoverySession {
  id: string;
  boardId: string;
  orgId: string;
  createdByUserId: string;
  status: DiscoverySessionStatus;
  /** SHA-256 hex do token opaco (nunca persistir token em claro). */
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  schemaVersion: number;
  formDefinition: DiscoveryFormDefinition;
  /** Título do board no momento da criação (cabeçalho do formulário público). */
  boardTitleSnapshot: string;
  responses: Record<string, string> | null;
  responsesSubmittedAt: string | null;
  processedAt: string | null;
  docId: string | null;
  cardDrafts: DiscoveryCardDraft[] | null;
}

type DiscoverySessionDoc = Omit<DiscoverySession, "id"> & { _id: string };

let indexesEnsured = false;

function boardIndexKey(orgId: string, boardId: string) {
  return `${KV_BOARD_INDEX}${orgId}:${boardId}`;
}

function toDoc(s: DiscoverySession): DiscoverySessionDoc {
  const { id, ...rest } = s;
  return { _id: id, ...rest };
}

function fromDoc(doc: DiscoverySessionDoc): DiscoverySession {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

export function hashDiscoveryToken(plainToken: string): string {
  return createHash("sha256").update(String(plainToken).trim(), "utf8").digest("hex");
}

export function newDiscoveryPlainToken(): string {
  return randomBytes(32).toString("base64url");
}

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const c = db.collection<DiscoverySessionDoc>(COL);
  await c.createIndex({ tokenHash: 1 }, { unique: true });
  await c.createIndex({ orgId: 1, boardId: 1, createdAt: -1 });
  await c.createIndex({ orgId: 1, expiresAt: 1 });
}

async function nextSessionId(db?: Db): Promise<string> {
  if (isMongoConfigured() && db) {
    const row = await db.collection<{ _id: string; seq: number }>("counters").findOneAndUpdate(
      { _id: COUNTER_ID },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const seq = typeof row?.seq === "number" ? row.seq : Date.now();
    return `ds_${seq}`;
  }
  const kv = await getStore();
  const key = `flux_counter:${COUNTER_ID}`;
  const persisted = ((await kv.get<number>(key)) as number | null) ?? 0;
  const next = persisted + 1;
  await kv.set(key, next);
  return `ds_${next}`;
}

async function readKvSession(id: string): Promise<DiscoverySession | null> {
  const kv = await getStore();
  const raw = await kv.get<string>(`${KV_PREFIX}${id}`);
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as DiscoverySession;
}

async function writeKvSession(session: DiscoverySession): Promise<void> {
  const kv = await getStore();
  await kv.set(`${KV_PREFIX}${session.id}`, JSON.stringify(session));
  await kv.set(`${KV_TOKEN_PREFIX}${session.tokenHash}`, session.id);
  const idxKey = boardIndexKey(session.orgId, session.boardId);
  const prev = (((await kv.get<string[]>(idxKey)) as string[] | null) ?? []).filter(Boolean);
  const ids = prev.includes(session.id) ? prev : [...prev, session.id];
  await kv.set(idxKey, ids);
}

export async function getDiscoverySessionByTokenHash(tokenHash: string): Promise<DiscoverySession | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<DiscoverySessionDoc>(COL).findOne({ tokenHash });
    return doc ? fromDoc(doc) : null;
  }
  const kv = await getStore();
  const id = await kv.get<string>(`${KV_TOKEN_PREFIX}${tokenHash}`);
  if (!id || typeof id !== "string") return null;
  return readKvSession(id);
}

export async function getDiscoverySessionById(
  orgId: string,
  boardId: string,
  sessionId: string
): Promise<DiscoverySession | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const doc = await db.collection<DiscoverySessionDoc>(COL).findOne({ _id: sessionId, orgId, boardId });
    return doc ? fromDoc(doc) : null;
  }
  const s = await readKvSession(sessionId);
  if (!s || s.orgId !== orgId || s.boardId !== boardId) return null;
  return s;
}

export async function listDiscoverySessionsForBoard(orgId: string, boardId: string): Promise<DiscoverySession[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const rows = await db
      .collection<DiscoverySessionDoc>(COL)
      .find({ orgId, boardId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return rows.map(fromDoc);
  }
  const kv = await getStore();
  const ids = (((await kv.get<string[]>(boardIndexKey(orgId, boardId))) as string[] | null) ?? []).filter(Boolean);
  const sessions = await Promise.all(ids.map((id) => readKvSession(id)));
  return sessions
    .filter((s): s is DiscoverySession => Boolean(s))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type CreateDiscoverySessionInput = {
  orgId: string;
  boardId: string;
  createdByUserId: string;
  boardTitleSnapshot: string;
  /** ISO; default 14 dias a partir de agora se omitido. */
  expiresAt?: string;
  formDefinition?: DiscoveryFormDefinition;
};

export type CreateDiscoverySessionResult = {
  session: DiscoverySession;
  /** Token em claro — mostrar uma vez ao PO. */
  plainToken: string;
};

export async function createDiscoverySession(input: CreateDiscoverySessionInput): Promise<CreateDiscoverySessionResult> {
  const plainToken = newDiscoveryPlainToken();
  const tokenHash = hashDiscoveryToken(plainToken);
  const now = new Date().toISOString();
  const expires =
    input.expiresAt && String(input.expiresAt).trim()
      ? String(input.expiresAt).trim()
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const formDefinition = input.formDefinition ?? defaultDiscoveryFormDefinition();

  const dbMaybe = isMongoConfigured() ? await getDb() : undefined;
  const id = await nextSessionId(dbMaybe);

  const session: DiscoverySession = {
    id,
    boardId: input.boardId,
    orgId: input.orgId,
    createdByUserId: input.createdByUserId,
    status: "open",
    tokenHash,
    expiresAt: expires,
    createdAt: now,
    schemaVersion: 1,
    formDefinition,
    boardTitleSnapshot: String(input.boardTitleSnapshot || "").trim().slice(0, 200) || "Board",
    responses: null,
    responsesSubmittedAt: null,
    processedAt: null,
    docId: null,
    cardDrafts: null,
  };

  if (isMongoConfigured()) {
    const db = dbMaybe!;
    await ensureIndexes(db);
    await db.collection<DiscoverySessionDoc>(COL).insertOne(toDoc(session));
    return { session, plainToken };
  }

  await writeKvSession(session);
  return { session, plainToken };
}

export async function updateDiscoverySession(
  orgId: string,
  boardId: string,
  sessionId: string,
  patch: Partial<
    Pick<
      DiscoverySession,
      | "status"
      | "responses"
      | "responsesSubmittedAt"
      | "processedAt"
      | "docId"
      | "cardDrafts"
      | "expiresAt"
    >
  >
): Promise<DiscoverySession | null> {
  const current = await getDiscoverySessionById(orgId, boardId, sessionId);
  if (!current) return null;
  const next: DiscoverySession = { ...current, ...patch };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<DiscoverySessionDoc>(COL).replaceOne({ _id: sessionId, orgId, boardId }, toDoc(next));
    return next;
  }

  await writeKvSession(next);
  return next;
}

/** URL pública relativa com locale (sem origin). */
export function discoverySessionPublicPath(locale: string, plainToken: string): string {
  const loc = locale === "en" || locale === "pt-BR" ? locale : "pt-BR";
  return `/${loc}/discovery/${encodeURIComponent(plainToken)}`;
}

export function discoveryPublicShareUrl(origin: string, locale: string, plainToken: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${discoverySessionPublicPath(locale, plainToken)}`;
}
