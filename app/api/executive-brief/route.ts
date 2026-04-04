import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { listBoardsForUser } from "@/lib/kv-boards";
import { boardsToPortfolioRows, buildExecutiveBriefMarkdown } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";

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
      assertFeatureAllowed(org, "executive_brief", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }
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
