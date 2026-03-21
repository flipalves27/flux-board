import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { processWebhookOutboxCron } from "@/lib/webhook-delivery";

function requireCronSecret(request: NextRequest): boolean {
  const required =
    process.env.WEBHOOK_CRON_SECRET ||
    process.env.ANOMALY_CRON_SECRET ||
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
    key: "cron:webhook-deliveries",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const out = await processWebhookOutboxCron(40);
  return NextResponse.json({ ok: true, ...out });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
