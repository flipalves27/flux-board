import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured } from "@/lib/mongo";
import { rateLimit } from "@/lib/rate-limit";
import { runCardDependencyJobAllOrgs } from "@/lib/card-dependency-cron";
import { verifyCronSecret } from "@/lib/cron-secret";

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request, ["CARD_DEPENDENCY_CRON_SECRET", "CRON_MASTER_SECRET"])) {
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
