import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser, getUserById } from "@/lib/kv-users";
import { getBoardIds, getBoardListRowsByIds, type BoardData } from "@/lib/kv-boards";
import { boardsToPortfolioRows, aggregatePortfolio } from "@/lib/portfolio-export-core";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, canUseFeature, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { canManageOrganization, deriveEffectiveRoles } from "@/lib/rbac";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { retrieveRelevantDocChunksWithDebug } from "@/lib/docs-rag";
import {
  buildOrgPortfolioContextText,
  buildOrgPortfolioRagBlock,
  type OkrRingSummary,
} from "@/lib/org-portfolio-ai";
import { listObjectivesWithKeyResults, type OkrsKeyResult, type OkrsObjective } from "@/lib/kv-okrs";
import {
  computeObjectiveProgressForOrg,
  type OkrsObjectiveDefinition,
  type OkrsKeyResultDefinition,
} from "@/lib/okr-engine";
import type { PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { currentQuarterLabel } from "@/lib/quarter-label";
import { rateLimit } from "@/lib/rate-limit";
import { zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";

export const runtime = "nodejs";

const BodySchema = z.object({
  message: z.string().trim().min(2).max(8000),
});

function toObjectiveDefinition(objective: OkrsObjective, keyResults: OkrsKeyResult[]): OkrsObjectiveDefinition {
  const krs: OkrsKeyResultDefinition[] = keyResults.map((kr) => ({
    id: kr.id,
    objectiveId: kr.objectiveId,
    title: kr.title,
    metric_type: kr.metric_type,
    target: kr.target,
    linkedBoardId: kr.linkedBoardId,
    linkedColumnKey: kr.linkedColumnKey,
    manualCurrent: kr.manualCurrent,
  }));
  return {
    id: objective.id,
    title: objective.title,
    owner: objective.owner,
    quarter: objective.quarter,
    keyResults: krs,
  };
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    await ensureAdminUser();
    const actor = await getUserById(payload.id, payload.orgId);
    if (!actor) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!canManageOrganization(deriveEffectiveRoles(payload))) {
      return NextResponse.json({ error: "Acesso restrito a gestores." }, { status: 403 });
    }

    const org = await getOrganizationById(payload.orgId);
    if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "executive_brief", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const rl = await rateLimit({
      key: `org-portfolio-ai:${payload.orgId}`,
      limit: 24,
      windowMs: 60 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const guardedMsg = guardUserPromptForLlm(parsed.data.message).text.trim();
    if (!guardedMsg) {
      return NextResponse.json({ error: "Mensagem vazia após validação." }, { status: 400 });
    }

    const boardIdsPortfolio = await getBoardIds(payload.id, payload.orgId, payload.seesAllBoardsInOrg);
    const boards = await getBoardListRowsByIds(boardIdsPortfolio, payload.orgId);
    const rows = boardsToPortfolioRows(boards);
    const aggregates = aggregatePortfolio(rows);
    const quarter = currentQuarterLabel();
    const boardById = new Map<string, BoardData>(boards.map((b) => [b.id, b]));

    let okrRings: OkrRingSummary[] = [];
    let okrAvgPct: number | null = null;
    const okrEnabled = canUseFeature(org, "okr_engine", gateCtx);

    if (okrEnabled) {
      const grouped = await listObjectivesWithKeyResults(payload.orgId, quarter);
      const computed = grouped.map(({ objective, keyResults }) => {
        const def = toObjectiveDefinition(objective, keyResults);
        const boardsById = new Map<string, PortfolioBoardLike>();
        for (const kr of keyResults) {
          const b = boardById.get(kr.linkedBoardId);
          if (b) boardsById.set(kr.linkedBoardId, b as PortfolioBoardLike);
        }
        return computeObjectiveProgressForOrg({ objective: def, boardsById });
      });
      okrRings = computed.map((c) => ({
        id: c.objective.id,
        title: c.objective.title,
        progressPct: c.objectiveCurrentPct,
        quarter: c.objective.quarter,
      }));
      if (computed.length) {
        okrAvgPct = Math.round(
          computed.reduce((acc, c) => acc + c.objectiveCurrentPct, 0) / computed.length
        );
      }
    }

    const contextText = buildOrgPortfolioContextText({
      orgName: org.name,
      quarter,
      aggregates: {
        boardCount: aggregates.boardCount,
        boardsWithCards: aggregates.boardsWithCards,
        avgRisco: aggregates.avgRisco,
        avgThroughput: aggregates.avgThroughput,
        avgPrevisibilidade: aggregates.avgPrevisibilidade,
        atRiskCount: aggregates.atRiskCount,
      },
      okrs: { enabled: okrEnabled, rings: okrRings, avgProgressPct: okrAvgPct },
      rows,
    });

    let ragBlock = "";
    if (canUseFeature(org, "flux_docs_rag", gateCtx)) {
      const { chunks } = await retrieveRelevantDocChunksWithDebug(payload.orgId, guardedMsg, 6);
      ragBlock = buildOrgPortfolioRagBlock(chunks.map((c) => ({ docTitle: c.docTitle, text: c.text })));
    }

    const systemPrompt = `Você é o assistente de portfólio (multi-board) do Flux Board. Responda em português (pt-BR), de forma objetiva e executiva.
Use apenas o contexto fornecido e os trechos de documentação (se houver). Se faltar dado, diga o que falta.
Não invente números que não estejam no contexto. Versão de prompt: ${FLUX_LLM_PROMPT_VERSION}.`;

    const userContent = [
      "## Contexto do portfólio\n",
      contextText,
      ragBlock ? `\n## Trechos relevantes da documentação interna\n${ragBlock}` : "",
      `\n## Pergunta do gestor\n${guardedMsg}`,
    ].join("");

    const res = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "org_portfolio_ai",
      mode: "batch",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent.slice(0, 48000) },
      ],
      options: { maxTokens: 1200, temperature: 0.35 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: res.error ?? "Falha ao gerar resposta" },
        { status: res.error?.includes("Cota") ? 403 : 500 }
      );
    }

    return NextResponse.json({
      reply: (res.assistantText ?? "").trim() || "_Sem resposta._",
      model: res.model,
      promptVersion: FLUX_LLM_PROMPT_VERSION,
    });
  } catch (err) {
    console.error("org/portfolio-ai", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
