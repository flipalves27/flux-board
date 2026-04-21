import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getSprint, listSprints } from "@/lib/kv-sprints";
import { computeRetrospective, buildRetroPrompt } from "@/lib/ai-retrospective";
import { runOrgLlmChat } from "@/lib/llm-org-chat";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "retro_facilitator", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const [board, sprint] = await Promise.all([
    getBoard(boardId, payload.orgId),
    getSprint(payload.orgId, sprintId),
  ]);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  if (!sprint) return NextResponse.json({ error: "Sprint não encontrada" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { locale?: string };
  const locale = body.locale ?? "pt-BR";

  const allSprints = await listSprints(payload.orgId, boardId);
  const sortedPrev = allSprints
    .filter((s) => s.id !== sprintId && s.endDate)
    .sort((a, b) => new Date(b.endDate!).getTime() - new Date(a.endDate!).getTime());
  const prevVelocity = sortedPrev[0]?.doneCardIds?.length ?? null;

  const allCards = (Array.isArray(board.cards) ? board.cards : []) as Parameters<
    typeof computeRetrospective
  >[1];

  const result = computeRetrospective(
    sprint as Parameters<typeof computeRetrospective>[0],
    allCards,
    prevVelocity
  );

  // LLM narrative (non-blocking, best-effort)
  try {
    const prompt = buildRetroPrompt(result, locale);
    const llmResult = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "ai_retrospective",
      messages: [{ role: "user", content: prompt }],
      options: { maxTokens: 300, temperature: 0.8 },
      mode: "batch",
      userId: payload.id,
      isAdmin: payload.isAdmin,
    });
    if (llmResult.ok) result.llmNarrative = llmResult.assistantText.trim();
  } catch {
    // LLM unavailable
  }

  return NextResponse.json({ ok: true, result });
}
