import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";
import { computeFlowCoachInsights, buildFlowCoachPrompt } from "@/lib/ai-flow-coach";
import { runOrgLlmChat } from "@/lib/llm-org-chat";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try {
    assertFeatureAllowed(org, "daily_insights");
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale ?? "pt-BR";

  const cards = (Array.isArray(board.cards) ? board.cards : []) as Parameters<typeof computeFlowCoachInsights>[0];
  const rawBuckets = board.config?.bucketOrder ?? [];
  const columns = (Array.isArray(rawBuckets) ? rawBuckets : []).map((c) => {
    const col = c as Record<string, unknown>;
    return {
      key: String(col.key ?? col.label ?? ""),
      label: String(col.label ?? col.key ?? ""),
      wipLimit: typeof col.wipLimit === "number" ? col.wipLimit : undefined,
    };
  });

  const result = computeFlowCoachInsights(cards, columns, { boardName: board.name, locale });

  try {
    const prompt = buildFlowCoachPrompt(result, board.name, locale);
    const llmResult = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "ai_flow_coach",
      messages: [{ role: "user", content: prompt }],
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
