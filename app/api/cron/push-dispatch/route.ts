import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-secret";
import { dispatchDuePushOutbox } from "@/lib/push-delivery";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, ["PUSH_CRON_SECRET", "CRON_MASTER_SECRET"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await dispatchDuePushOutbox(200);
  return NextResponse.json({ ok: true, ...result });
}

