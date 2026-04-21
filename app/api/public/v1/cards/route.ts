import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { assertPublicApiKey, assertPublicApiScope } from "@/lib/public-api-auth";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { getBoard, updateBoardFromExisting } from "@/lib/kv-boards";

export const runtime = "nodejs";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  boardId: z.string().trim().optional(),
  q: z.string().trim().optional(),
  bucket: z.string().trim().optional(),
});

const CardCreateSchema = z.object({
  boardId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  bucket: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  progress: z.string().trim().optional(),
  dueDate: z.string().trim().nullable().optional(),
  assignee: z.string().trim().nullable().optional(),
  desc: z.string().trim().max(5000).optional(),
});

const CardUpdateSchema = z.object({
  boardId: z.string().trim().min(1),
  cardId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  bucket: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  progress: z.string().trim().optional(),
  dueDate: z.string().trim().nullable().optional(),
  assignee: z.string().trim().nullable().optional(),
  desc: z.string().trim().max(5000).optional(),
});

type FlatCard = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  bucket?: string;
  priority?: string;
  progress?: string;
  dueDate?: string | null;
  updatedAt?: string | null;
};

export async function GET(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "cards:read");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Public API v1 requires MongoDB.", code: "PUBLIC_API_BACKEND_UNAVAILABLE" }, { status: 503 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    boardId: url.searchParams.get("boardId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    bucket: url.searchParams.get("bucket") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query parameters.", code: "PUBLIC_API_INVALID_QUERY" }, { status: 400 });

  const { page, limit, boardId, q, bucket } = parsed.data;
  const db = await getDb();
  const boardFilter: Record<string, unknown> = { orgId: auth.orgId };
  if (boardId) boardFilter._id = boardId;
  const boards = await db
    .collection("boards")
    .find(boardFilter as never, { projection: { _id: 1, name: 1, cards: 1 } })
    .toArray();

  const cards: FlatCard[] = [];
  for (const board of boards) {
    const row = board as Record<string, unknown>;
    const bId = String(row._id ?? "");
    const bName = String(row.name ?? "");
    const boardCards = Array.isArray(row.cards) ? (row.cards as Array<Record<string, unknown>>) : [];
    for (const c of boardCards) {
      cards.push({
        id: String(c.id ?? ""),
        title: String(c.title ?? ""),
        boardId: bId,
        boardName: bName,
        bucket: c.bucket ? String(c.bucket) : undefined,
        priority: c.priority ? String(c.priority) : undefined,
        progress: c.progress ? String(c.progress) : undefined,
        dueDate: c.dueDate ? String(c.dueDate) : null,
        updatedAt: c.updatedAt ? String(c.updatedAt) : null,
      });
    }
  }

  const filtered = cards.filter((c) => {
    if (q) {
      const needle = q.toLowerCase();
      if (!c.title.toLowerCase().includes(needle) && !c.id.toLowerCase().includes(needle)) return false;
    }
    if (bucket && c.bucket !== bucket) return false;
    return true;
  });

  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);
  return NextResponse.json({ items, page, limit, total: filtered.length });
}

export async function POST(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "cards:write");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  const body = await request.json().catch(() => ({}));
  const parsed = CardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", code: "PUBLIC_API_INVALID_BODY" }, { status: 400 });
  }

  const board = await getBoard(parsed.data.boardId, auth.orgId);
  if (!board) return NextResponse.json({ error: "Board not found.", code: "PUBLIC_API_NOT_FOUND" }, { status: 404 });

  const id = `card_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
  const card = {
    id,
    title: parsed.data.title,
    bucket: parsed.data.bucket ?? "Backlog",
    priority: parsed.data.priority ?? "Média",
    progress: parsed.data.progress ?? "Não iniciado",
    dueDate: parsed.data.dueDate ?? null,
    assignee: parsed.data.assignee ?? null,
    desc: parsed.data.desc ?? "",
    tags: [] as string[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const cards = [...((board.cards as unknown[]) ?? []), card];
  await updateBoardFromExisting(board, { cards });
  return NextResponse.json({ item: card }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "cards:write");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  const body = await request.json().catch(() => ({}));
  const parsed = CardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", code: "PUBLIC_API_INVALID_BODY" }, { status: 400 });
  }

  const board = await getBoard(parsed.data.boardId, auth.orgId);
  if (!board) return NextResponse.json({ error: "Board not found.", code: "PUBLIC_API_NOT_FOUND" }, { status: 404 });
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const idx = cards.findIndex((c) => String(c.id) === parsed.data.cardId);
  if (idx < 0) return NextResponse.json({ error: "Card not found.", code: "PUBLIC_API_NOT_FOUND" }, { status: 404 });

  const current = cards[idx];
  const next = {
    ...current,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.bucket !== undefined ? { bucket: parsed.data.bucket } : {}),
    ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
    ...(parsed.data.progress !== undefined ? { progress: parsed.data.progress } : {}),
    ...(parsed.data.dueDate !== undefined ? { dueDate: parsed.data.dueDate } : {}),
    ...(parsed.data.assignee !== undefined ? { assignee: parsed.data.assignee } : {}),
    ...(parsed.data.desc !== undefined ? { desc: parsed.data.desc } : {}),
    updatedAt: new Date().toISOString(),
  };
  const nextCards = [...cards];
  nextCards[idx] = next;
  await updateBoardFromExisting(board, { cards: nextCards });
  return NextResponse.json({ item: next });
}

