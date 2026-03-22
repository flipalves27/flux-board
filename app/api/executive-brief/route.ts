import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { ensureBoardReborn, getDefaultBoardData, listBoardsForUser } from "@/lib/kv-boards";
import { boardsToPortfolioRows, buildExecutiveBriefMarkdown } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "executive_brief", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    await ensureBoardReborn(payload.orgId, "admin", getDefaultBoardData);

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const rows = boardsToPortfolioRows(boards);
    const generatedAt = new Date().toISOString();
    const userLabel = payload.username || payload.id;
    const markdown = buildExecutiveBriefMarkdown({ userLabel, generatedAt, rows });

    return NextResponse.json({
      markdown,
      generatedAt,
      format: "markdown-v1",
    });
  } catch (err) {
    console.error("Executive brief API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
