import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured } from "@/lib/mongo";
import { rateLimit } from "@/lib/rate-limit";
import { runAnomalyCheckAllOrgs } from "@/lib/anomaly-service";

function requireCronSecret(request: NextRequest): boolean {
  const required =
    process.env.ANOMALY_CRON_SECRET || process.env.WEEKLY_DIGEST_SECRET || process.env.AUTOMATION_CRON_SECRET;
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
    key: "cron:anomaly-check",
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Anomaly check requer MongoDB (métricas e histórico)." },
      { status: 501 }
    );
  }

  const nowMs = Date.now();
  const out = await runAnomalyCheckAllOrgs(nowMs);

  return NextResponse.json({
    ok: true,
    now: new Date(nowMs).toISOString(),
    processedOrgs: out.processedOrgs,
    totalAlerts: out.totalAlerts,
    results: out.results,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
