import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { assertPublicApiKey, assertPublicApiScope } from "@/lib/public-api-auth";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";
import { createSprint, getSprint, updateSprint } from "@/lib/kv-sprints";

export const runtime = "nodejs";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  boardId: z.string().trim().optional(),
  status: z.enum(["planning", "active", "review", "closed"]).optional(),
});

const SprintCreateSchema = z.object({
  boardId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
});

const SprintUpdateSchema = z.object({
  sprintId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  goal: z.string().trim().max(1000).optional(),
  status: z.enum(["planning", "active", "review", "closed"]).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "sprints:read");
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
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query parameters.", code: "PUBLIC_API_INVALID_QUERY" }, { status: 400 });

  const { page, limit, boardId, status } = parsed.data;
  const skip = (page - 1) * limit;
  const db = await getDb();
  const filter: Record<string, unknown> = {
    orgId: auth.orgId,
    ...(boardId ? { boardId } : {}),
    ...(status ? { status } : {}),
  };

  const col = db.collection("sprints");
  const [itemsRaw, total] = await Promise.all([
    col
      .find(filter, {
        projection: {
          id: 1,
          boardId: 1,
          name: 1,
          goal: 1,
          status: 1,
          startDate: 1,
          endDate: 1,
          velocity: 1,
          updatedAt: 1,
        },
      })
      .sort({ updatedAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  const items = itemsRaw.map((s) => ({
    id: String((s as { id?: string }).id ?? ""),
    boardId: String((s as { boardId?: string }).boardId ?? ""),
    name: String((s as { name?: string }).name ?? ""),
    goal: (s as { goal?: string }).goal ?? "",
    status: String((s as { status?: string }).status ?? ""),
    startDate: (s as { startDate?: string | null }).startDate ?? null,
    endDate: (s as { endDate?: string | null }).endDate ?? null,
    velocity: (s as { velocity?: number | null }).velocity ?? null,
    updatedAt: (s as { updatedAt?: string | null }).updatedAt ?? null,
  }));

  return NextResponse.json({ items, page, limit, total });
}

export async function POST(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "sprints:write");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  const body = await request.json().catch(() => ({}));
  const parsed = SprintCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "PUBLIC_API_INVALID_BODY" }, { status: 400 });

  const sprint = await createSprint({
    orgId: auth.orgId,
    boardId: parsed.data.boardId,
    name: parsed.data.name,
    goal: parsed.data.goal,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
  });
  return NextResponse.json({ item: sprint }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "sprints:write");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  const body = await request.json().catch(() => ({}));
  const parsed = SprintUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "PUBLIC_API_INVALID_BODY" }, { status: 400 });

  const existing = await getSprint(auth.orgId, parsed.data.sprintId);
  if (!existing) return NextResponse.json({ error: "Sprint not found.", code: "PUBLIC_API_NOT_FOUND" }, { status: 404 });

  const sprint = await updateSprint(auth.orgId, parsed.data.sprintId, {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.goal !== undefined ? { goal: parsed.data.goal } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.startDate !== undefined ? { startDate: parsed.data.startDate } : {}),
    ...(parsed.data.endDate !== undefined ? { endDate: parsed.data.endDate } : {}),
  });
  return NextResponse.json({ item: sprint });
}

