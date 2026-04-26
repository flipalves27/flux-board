import { NextRequest, NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import type { ForgeJob } from "@/lib/forge-types";

export const runtime = "nodejs";

/**
 * External autonomous worker: returns one pending job for an org.
 * Header: Authorization: Bearer $FLUX_FORGE_WORKER_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = process.env.FLUX_FORGE_WORKER_SECRET?.trim();
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId")?.trim();
  if (!orgId) {
    return NextResponse.json({ error: "orgId query required" }, { status: 400 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ job: null, persistence: false });
  }

  const db = await getDb();
  const job = await db.collection<ForgeJob>("forge_jobs").findOne(
    {
      orgId,
      tier: "autonomous",
      status: { $in: ["queued", "testing", "generating"] },
    },
    { sort: { createdAt: 1 } }
  );

  return NextResponse.json({ job: job ?? null, persistence: true });
}
