import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { ensureBoardReborn, getDefaultBoardData, listBoardsForUser } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import {
  buildCfdDailyChartRows,
  buildCfdDailyMeta,
  collectCfdKeyOrder,
  dayKeyUtc,
  detectWipRising,
  ensureCfdDailySnapshotIndexes,
  enumerateDaysInclusive,
  loadCfdDailySnapshotsForBoards,
  mergeSnapshotsIntoByDay,
  normalizeCfdKeys,
  parseCfdDailyPeriod,
} from "@/lib/cfd-daily-from-snapshots";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * CFD diário (snapshots em anomaly_daily_snapshots, preenchidos pelo cron /api/cron/anomaly-check).
 * Query: ?period=14|30|90
 */
export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const period = parseCfdDailyPeriod(request.nextUrl.searchParams.get("period"));
  const nowMs = Date.now();
  const toDay = dayKeyUtc(nowMs);
  const fromDay = dayKeyUtc(nowMs - (period - 1) * DAY_MS);

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    try {
      assertFeatureAllowed(org, "portfolio_export");
    } catch (err) {
      if (err instanceof PlanGateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    await ensureBoardReborn(payload.orgId, "admin", getDefaultBoardData);

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const boardIds = boards.map((b) => b.id).filter(Boolean);

    const emptyNote =
      "Histórico diário vem do job de anomalias (GET /api/cron/anomaly-check). Sem execuções, o gráfico fica vazio.";

    if (!isMongoConfigured() || !boardIds.length) {
      const meta = buildCfdDailyMeta(boards, collectCfdKeyOrder(boards).length ? [...collectCfdKeyOrder(boards), "__done__"] : ["__done__"]);
      return NextResponse.json({
        schema: "flux-board.cfd_daily.v1",
        periodDays: period,
        fromDay,
        toDay,
        ...meta,
        rows: [],
        wipRising: false,
        distinctSnapshotDays: 0,
        note: !isMongoConfigured() ? "MongoDB é necessário para o CFD diário." : emptyNote,
      });
    }

    const t0 = Date.now();
    const db = await getDb();
    await ensureCfdDailySnapshotIndexes(db);

    const raw = await loadCfdDailySnapshotsForBoards({
      db,
      orgId: payload.orgId,
      boardIds,
      fromDay,
      toDay,
    });
    const byDayRaw = mergeSnapshotsIntoByDay(raw);
    const keyOrder = collectCfdKeyOrder(boards);
    const keys = normalizeCfdKeys(keyOrder, byDayRaw);
    const allDays = enumerateDaysInclusive(fromDay, toDay);
    const { rows, distinctSnapshotDays } = buildCfdDailyChartRows({ keys, byDayRaw, allDays });
    const wipRising = detectWipRising(rows, keys);
    const meta = buildCfdDailyMeta(boards, keys);

    const serverMs = Date.now() - t0;

    return NextResponse.json({
      schema: "flux-board.cfd_daily.v1",
      periodDays: period,
      fromDay,
      toDay,
      ...meta,
      rows,
      wipRising,
      distinctSnapshotDays,
      serverMs: Math.round(serverMs * 100) / 100,
      note:
        "CFD com snapshots diários (cards por coluna + concluídos). Áreas empilhadas ≈ WIP por etapa; faixa Concluídos inclui cards em progresso Concluída.",
    });
  } catch (err) {
    console.error("cfd-daily API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
