import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { computeFlowCoachInsights, buildFlowCoachPrompt } from "@/lib/ai-flow-coach";
import { runOrgLlmChat } from "@/lib/llm-org-chat";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "ai_insights", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { locale?: string };
  const locale = body.locale ?? "pt-BR";

  const cards = (Array.isArray(board.cards) ? board.cards : []) as Parameters<typeof computeFlowCoachInsights>[0];
  const columns = (board.config?.bucketOrder ?? []).map((c: Record<string, unknown>) => ({
    key: String(c.key ?? c.label ?? ""),
    label: String(c.label ?? c.key ?? ""),
    wipLimit: typeof c.wipLimit === "number" ? c.wipLimit : undefined,
  }));

  const result = computeFlowCoachInsights(cards, columns, { boardName: board.name, locale });

  // LLM summary (non-blocking, best-effort)
  try {
    const prompt = buildFlowCoachPrompt(result, board.name, locale);
    const llmResult = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "ai_flow_coach",
      messages: [
        { role: "user", content: prompt },
      ],
      options: { maxTokens: 200, temperature: 0.7 },
      mode: "batch",
      userId: payload.id,
      isAdmin: payload.isAdmin,
    });
    if (llmResult.ok) {
      result.llmSummary = llmResult.assistantText.trim();
    }
  } catch {
    // LLM unavailable — proceed with heuristic result
  }

  return NextResponse.json({ ok: true, result });
}
