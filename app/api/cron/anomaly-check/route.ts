import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured } from "@/lib/mongo";
import { rateLimit } from "@/lib/rate-limit";
import { runAnomalyCheckAllOrgs } from "@/lib/anomaly-service";
import { verifyCronSecret } from "@/lib/cron-secret";

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request, ["ANOMALY_CRON_SECRET", "CRON_MASTER_SECRET"])) {
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
