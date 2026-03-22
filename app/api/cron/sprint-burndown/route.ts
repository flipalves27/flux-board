import { NextRequest, NextResponse } from "next/server";
import { getBoard } from "@/lib/kv-boards";
import { appendBurndownSnapshot, listActiveSprintsAllOrgs } from "@/lib/kv-sprints";
import { isMongoConfigured } from "@/lib/mongo";
import { rateLimit } from "@/lib/rate-limit";
import { computeBurndownSnapshotForSprintDate } from "@/lib/sprint-burndown-daily";

function requireCronSecret(request: NextRequest): boolean {
  const required = process.env.AUTOMATION_CRON_SECRET || process.env.WEEKLY_DIGEST_SECRET;
  if (!required) return true;
  const header = request.headers.get("x-cron-secret");
  if (!header) return false;
  return header === required;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit({
    key: "cron:sprint-burndown",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Cron de burndown requer MONGODB_URI (listagem de sprints ativos)." },
      { status: 501 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const active = await listActiveSprintsAllOrgs();
  let processed = 0;
  let appended = 0;
  let skipped = 0;

  for (const sprint of active) {
    processed++;
    const board = await getBoard(sprint.boardId, sprint.orgId);
    if (!board) {
      skipped++;
      continue;
    }
    const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
    const row = computeBurndownSnapshotForSprintDate({ sprint, cards, snapshotDate: today });
    if (!row) {
      skipped++;
      continue;
    }
    const next = await appendBurndownSnapshot(sprint.orgId, sprint.id, row);
    if (next) appended++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, today, processed, appended, skipped, totalActive: active.length });
}
