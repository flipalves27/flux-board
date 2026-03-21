import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured } from "@/lib/mongo";
import { rateLimit } from "@/lib/rate-limit";
import { runCardDependencyJobAllOrgs } from "@/lib/card-dependency-cron";

function requireCronSecret(request: NextRequest): boolean {
  const required =
    process.env.CARD_DEPENDENCY_CRON_SECRET ||
    process.env.ANOMALY_CRON_SECRET ||
    process.env.WEEKLY_DIGEST_SECRET ||
    process.env.AUTOMATION_CRON_SECRET;
  if (!required) return true;
  const header = request.headers.get("x-cron-secret");
  if (!header) return false;
  return header === required;
}

async function handle(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    key: "cron:card-dependencies",
    limit: 8,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "MongoDB obrigatório." }, { status: 501 });
  }

  const nowMs = Date.now();
  const out = await runCardDependencyJobAllOrgs(nowMs);

  return NextResponse.json({
    ok: true,
    now: new Date(nowMs).toISOString(),
    processedOrgs: out.processedOrgs,
    results: out.results,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
