import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { listBoardsForUser } from "@/lib/kv-boards";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";

/**
 * Export JSON do portfólio para integrações (BI, n8n, data warehouse).
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
    try {
      assertFeatureAllowed(org, "portfolio_export", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }
    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);

    const exportedAt = new Date().toISOString();

    return NextResponse.json({
      schema: "flux-board.portfolio.v1",
      exportedAt,
      userId: payload.id,
      isAdmin: payload.isAdmin,
      aggregates,
      boards: rows.map((r) => ({
        id: r.id,
        name: r.name,
        ownerId: r.ownerId,
        clientLabel: r.clientLabel ?? null,
        lastUpdated: r.lastUpdated ?? null,
        metrics: {
          cardCount: r.portfolio.cardCount,
          risco: r.portfolio.risco,
          throughput: r.portfolio.throughput,
          previsibilidade: r.portfolio.previsibilidade,
        },
      })),
    });
  } catch (err) {
    console.error("Portfolio export API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
