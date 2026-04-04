import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { assertPublicApiKey, assertPublicApiScope } from "@/lib/public-api-auth";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { createComment } from "@/lib/kv-comments";

export const runtime = "nodejs";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  boardId: z.string().trim().min(1),
  cardId: z.string().trim().min(1),
});

const CreateSchema = z.object({
  boardId: z.string().trim().min(1),
  cardId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(2000),
  authorId: z.string().trim().optional(),
  mentions: z.array(z.string().trim().max(200)).optional(),
});

export async function GET(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "comments:read");
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
    cardId: url.searchParams.get("cardId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query parameters.", code: "PUBLIC_API_INVALID_QUERY" }, { status: 400 });

  const { page, limit, boardId, cardId } = parsed.data;
  const skip = (page - 1) * limit;
  const db = await getDb();
  const filter = { orgId: auth.orgId, boardId, cardId };

  const col = db.collection("card_comments");
  const [itemsRaw, total] = await Promise.all([
    col
      .find(filter, {
        projection: {
          id: 1,
          boardId: 1,
          cardId: 1,
          authorId: 1,
          body: 1,
          mentions: 1,
          createdAt: 1,
          editedAt: 1,
        },
      })
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  const items = itemsRaw.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      boardId: String(row.boardId ?? ""),
      cardId: String(row.cardId ?? ""),
      authorId: String(row.authorId ?? ""),
      body: String(row.body ?? ""),
      mentions: Array.isArray(row.mentions) ? row.mentions.map((m) => String(m)) : [],
      createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
      editedAt: typeof row.editedAt === "string" ? row.editedAt : null,
    };
  });

  return NextResponse.json({ items, page, limit, total });
}

export async function POST(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "comments:write");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "PUBLIC_API_INVALID_BODY" }, { status: 400 });

  const comment = await createComment({
    orgId: auth.orgId,
    boardId: parsed.data.boardId,
    cardId: parsed.data.cardId,
    authorId: parsed.data.authorId || "public_api",
    body: parsed.data.body,
    mentions: parsed.data.mentions ?? [],
    parentCommentId: null,
  });
  return NextResponse.json({ item: comment }, { status: 201 });
}

