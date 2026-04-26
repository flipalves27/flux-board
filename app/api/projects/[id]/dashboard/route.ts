import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoardListRowsByIds } from "@/lib/kv-boards";
import { getProject } from "@/lib/kv-projects";
import { averageNullable, computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { publicApiErrorResponse } from "@/lib/public-api-error";

type Params = { params: Promise<{ id: string }> };

function forecastStatus(actual?: number | null, forecast?: number | null, budget?: number | null) {
  if (!budget || budget <= 0) return "unknown";
  const value = forecast ?? actual ?? 0;
  if (value > budget * 1.1) return "over";
  if (value > budget * 0.9) return "watch";
  return "ok";
}

export async function GET(request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const project = await getProject(payload.orgId, id);
    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const boards = await getBoardListRowsByIds(boardIds, payload.orgId, { projectId: id });
    const portfolios = boards.map((board) => ({
      boardId: board.id,
      name: board.name,
      methodology: board.boardMethodology,
      lastUpdated: board.lastUpdated,
      metrics: computeBoardPortfolio(board as PortfolioBoardLike),
    }));
    const withCards = portfolios.filter((p) => p.metrics.cardCount > 0);
    const riskCount = withCards.filter((p) => (p.metrics.risco ?? 100) < 48).length;
    const blockedMilestones = (project.roadmap ?? []).filter((item) => item.status === "blocked").length;
    const upcomingMilestones = (project.roadmap ?? [])
      .filter((item) => item.status !== "done" && item.targetDate)
      .slice(0, 5);

    const dashboard = {
      projectId: project.id,
      health: project.health,
      status: project.status,
      progressPct: project.progressPct ?? null,
      confidence: project.confidence ?? null,
      boards: {
        count: boards.length,
        riskCount,
        avgRisco: averageNullable(withCards.map((p) => p.metrics.risco)),
        avgThroughput: averageNullable(withCards.map((p) => p.metrics.throughput)),
        avgPrevisibilidade: averageNullable(withCards.map((p) => p.metrics.previsibilidade)),
        rows: portfolios,
      },
      strategy: {
        vision: project.vision,
        businessOutcome: project.businessOutcome,
        strategicThemes: project.strategicThemes ?? [],
        okrs: project.okrs ?? [],
        northStarMetric: project.northStarMetric,
        successCriteria: project.successCriteria ?? [],
      },
      governance: {
        ...project.governance,
        blockedMilestones,
        policy: project.planningPolicy,
        rolloutRisk:
          riskCount > 0 || blockedMilestones > 0 || project.health === "red" || project.health === "blocked"
            ? "attention"
            : "normal",
      },
      financials: {
        ...project.financials,
        forecastStatus: forecastStatus(
          project.financials?.actualCost,
          project.financials?.forecastCost,
          project.financials?.budget
        ),
      },
      roadmap: {
        items: project.roadmap ?? [],
        upcomingMilestones,
        blockedMilestones,
      },
      ai: {
        guardrails: project.ai?.guardrails ?? [],
        recommendations: project.ai?.recommendationLog ?? [],
        suggestedPrompts: [
          "Qual risco ameaça o roadmap deste projeto?",
          "Qual board esta bloqueando o proximo marco?",
          "Qual cenario reduz custo mantendo prazo?",
          "Quais dados faltam para uma previsao mais confiavel?",
        ],
      },
      validation: {
        successMetrics: [
          "100% dos boards do projeto com projectId.",
          "Dashboard com risco, throughput e previsibilidade calculados.",
          "Custos com budget, actualCost e forecastCost revisados.",
        ],
        rolloutGates: [
          "Migracao idempotente executada sem boards orfaos.",
          "Criacao de board validando projeto da mesma organizacao.",
          "Arquivamento bloqueado quando houver boards ativos.",
        ],
      },
    };

    return NextResponse.json({ project, dashboard });
  } catch (err) {
    console.error("Project dashboard API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/dashboard/route.ts" });
  }
}
