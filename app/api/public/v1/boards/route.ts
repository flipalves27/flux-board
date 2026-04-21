import { z } from "zod";
import { NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { assertPublicApiKey, assertPublicApiScope } from "@/lib/public-api-auth";
import { enforcePublicApiRateLimit } from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

export async function GET(request: Request) {
  const auth = await assertPublicApiKey(request);
  if (!auth.ok) return auth.response;
  const deniedScope = assertPublicApiScope(auth, "boards:read");
  if (deniedScope) return deniedScope.response;
  const deniedRateLimit = await enforcePublicApiRateLimit(request, auth);
  if (deniedRateLimit) return deniedRateLimit;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      {
        error: "Public API v1 requires MongoDB.",
        code: "PUBLIC_API_BACKEND_UNAVAILABLE",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters.",
        code: "PUBLIC_API_INVALID_QUERY",
      },
      { status: 400 }
    );
  }

  const { page, limit, q } = parsed.data;
  const skip = (page - 1) * limit;
  const db = await getDb();
  const filter: Record<string, unknown> = { orgId: auth.orgId };
  if (q) {
    filter.name = { $regex: q, $options: "i" };
  }

  const col = db.collection("boards");
  const [itemsRaw, total] = await Promise.all([
    col
      .find(filter, {
        projection: {
          _id: 1,
          name: 1,
          orgId: 1,
          ownerId: 1,
          boardMethodology: 1,
          clientLabel: 1,
          createdAt: 1,
          lastUpdated: 1,
        },
      })
      .sort({ lastUpdated: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  const items = itemsRaw.map((doc) => {
    const row = doc as Record<string, unknown>;
    return {
      id: String(row._id ?? ""),
      name: String(row.name ?? ""),
      orgId: String(row.orgId ?? ""),
      ownerId: String(row.ownerId ?? ""),
      boardMethodology: typeof row.boardMethodology === "string" ? row.boardMethodology : undefined,
      clientLabel: typeof row.clientLabel === "string" ? row.clientLabel : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
      lastUpdated: typeof row.lastUpdated === "string" ? row.lastUpdated : null,
    };
  });

  return NextResponse.json({
    items,
    page,
    limit,
    total,
  });
}

