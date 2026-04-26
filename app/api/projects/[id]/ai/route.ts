import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getBoardIds, getBoardListRowsByIds } from "@/lib/kv-boards";
import { getProject } from "@/lib/kv-projects";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { ProjectAiBodySchema, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { rateLimit } from "@/lib/rate-limit";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const [org, project] = await Promise.all([
      getOrganizationById(payload.orgId),
      getProject(payload.orgId, id),
    ]);
    if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    try {
      assertFeatureAllowed(org, "project_ai", planGateCtxFromAuthPayload(payload));
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const rl = await rateLimit({
      key: `project-ai:${payload.orgId}:${project.id}`,
      limit: 24,
      windowMs: 60 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = ProjectAiBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const guardedMsg = guardUserPromptForLlm(parsed.data.message).text.trim();
    if (!guardedMsg) return NextResponse.json({ error: "Mensagem vazia após validação." }, { status: 400 });

    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.seesAllBoardsInOrg);
    const boards = await getBoardListRowsByIds(boardIds, payload.orgId, { projectId: project.id });
    const rows = boards.map((board) => ({
      id: board.id,
      name: board.name,
      methodology: board.boardMethodology ?? "scrum",
      metrics: computeBoardPortfolio(board as PortfolioBoardLike),
    }));

    const systemPrompt = `Voce e o copiloto de projeto do Flux Board. Responda em portugues (pt-BR), com tom executivo e pratico.
Use apenas o contexto fornecido. Nao invente numeros; quando faltar dado, diga exatamente qual dado falta.
Cubra risco, custo, roadmap, governanca e trade-offs quando relevante. Versao de prompt: ${FLUX_LLM_PROMPT_VERSION}.`;

    const userContent = [
      `## Projeto\n${JSON.stringify({
        id: project.id,
        name: project.name,
        status: project.status,
        health: project.health,
        progressPct: project.progressPct,
        deliveryModel: project.deliveryModel,
        vision: project.vision,
        businessOutcome: project.businessOutcome,
        strategicThemes: project.strategicThemes,
        okrs: project.okrs,
        governance: project.governance,
        financials: project.financials,
        roadmap: project.roadmap,
        aiGuardrails: project.ai?.guardrails,
      })}`,
      `\n## Boards vinculados\n${JSON.stringify(rows)}`,
      `\n## Pergunta\n${guardedMsg}`,
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
    console.error("Project AI API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/ai/route.ts" });
  }
}
