import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getBoardIds, getBoardListRowsByIds } from "@/lib/kv-boards";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { maskPii } from "@/lib/pii-scan";

/**
 * Export JSON do portfólio para integrações (BI, n8n, data warehouse).
 * `?piiSafe=1` mascara e-mails e padrões sensíveis em campos de texto (clientLabel, nomes).
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }
    const boardIdsExport = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const boards = await getBoardListRowsByIds(boardIdsExport, payload.orgId);
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);

    const exportedAt = new Date().toISOString();
    const piiSafe = request.nextUrl.searchParams.get("piiSafe") === "1" || request.nextUrl.searchParams.get("piiSafe") === "true";

    const boardPayload = rows.map((r) => ({
      id: r.id,
      name: piiSafe ? maskPii(r.name).masked : r.name,
      ownerId: r.ownerId,
      clientLabel: r.clientLabel
        ? piiSafe
          ? maskPii(r.clientLabel).masked
          : r.clientLabel
        : null,
      lastUpdated: r.lastUpdated ?? null,
      metrics: {
        cardCount: r.portfolio.cardCount,
        risco: r.portfolio.risco,
        throughput: r.portfolio.throughput,
        previsibilidade: r.portfolio.previsibilidade,
      },
    }));

    return NextResponse.json({
      schema: "flux-board.portfolio.v1",
      exportedAt,
      userId: payload.id,
      isAdmin: payload.isAdmin,
      piiSafe,
      aggregates,
      boards: boardPayload,
    });
  } catch (err) {
    console.error("Portfolio export API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
