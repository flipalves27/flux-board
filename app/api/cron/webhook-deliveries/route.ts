import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { processWebhookOutboxCron } from "@/lib/webhook-delivery";
import { verifyCronSecret } from "@/lib/cron-secret";

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request, ["WEBHOOK_CRON_SECRET", "CRON_MASTER_SECRET"])) {
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
