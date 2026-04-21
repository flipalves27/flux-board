import { NextRequest, NextResponse } from "next/server";
import { isMongoConfigured, getDb } from "@/lib/mongo";
import { runCronAutomationsForBoard } from "@/lib/automation-engine";
import { getBoard } from "@/lib/kv-boards";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCronSecret } from "@/lib/cron-secret";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request, ["AUTOMATION_CRON_SECRET", "CRON_MASTER_SECRET", "WEEKLY_DIGEST_SECRET"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    key: "cron:automations",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Cron de automações requer MONGODB_URI (lista de boards)." },
      { status: 501 }
    );
  }

  const db = await getDb();
  const maxBoards = Math.min(500, Math.max(1, Number(process.env.AUTOMATION_CRON_MAX_BOARDS ?? 200) || 200));
  const rows = await db
    .collection<{ _id: string; orgId: string }>("boards")
    .find({})
    .project({ _id: 1, orgId: 1 })
    .limit(maxBoards)
    .toArray();

  let processed = 0;
  let updated = 0;

  for (const row of rows) {
    processed++;
    try {
      const board = await getBoard(row._id, row.orgId);
      if (!board) continue;
      const next = await runCronAutomationsForBoard(board);
      if (next) updated++;
    } catch (e) {
      console.error("[cron/automations] board", row._id, e);
    }
  }

  return NextResponse.json({ ok: true, processed, updated });
}
