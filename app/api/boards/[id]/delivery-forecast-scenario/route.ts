import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { computeDeliveryForecastForBoard } from "@/lib/board-delivery-forecast";
import { parseDeliveryScenarioNl } from "@/lib/delivery-scenario-nl";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { zodErrorToMessage } from "@/lib/schemas";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  removeItems: z.number().int().min(0).max(500).optional(),
  capacityMultiplier: z.number().min(0.25).max(2.5).optional(),
  /** Quando presente, deriva removeItems/capacityMultiplier e combina com campos explícitos. */
  message: z.string().max(4000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "risk_score", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const rl = await rateLimit({
    key: `delivery-scenario:${payload.orgId}:${boardId}`,
    limit: 40,
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

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let removeItems = parsed.data.removeItems ?? 0;
  let capacityMultiplier = parsed.data.capacityMultiplier ?? 1;
  const nlParts: string[] = [];

  if (parsed.data.message?.trim()) {
    const nl = parseDeliveryScenarioNl(parsed.data.message);
    if (nl.removeItems > 0) removeItems = nl.removeItems;
    if (nl.capacityMultiplier !== 1) capacityMultiplier = nl.capacityMultiplier;
    nlParts.push(...nl.matched);
  }

  const baseline = computeDeliveryForecastForBoard(board);
  const scenario = computeDeliveryForecastForBoard(board, { removeItems, capacityMultiplier });

  let narrative = "";
  const mcB = baseline.result.monteCarlo;
  const mcS = scenario.result.monteCarlo;
  if (mcB && mcS) {
    narrative = `Baseline: P50 ${mcB.p50Days}d, P85 ${mcB.p85Days}d. Cenário: P50 ${mcS.p50Days}d, P85 ${mcS.p85Days}d. Escopo restante: ${scenario.audit.incompleteCountScenario} itens (era ${scenario.audit.incompleteCountBaseline}). Throughput histórico × ${scenario.audit.capacityMultiplier}.`;
  } else {
    narrative =
      "Dados insuficientes para Monte Carlo (precisa de histórico de conclusões nos últimos dias e itens em aberto).";
  }

  const explainRes = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "delivery_forecast_scenario",
    mode: "batch",
    messages: [
      {
        role: "user",
        content: `Você é um assistente de entrega ágil. Explique em 2–4 frases em português (pt-BR) o que mudou entre baseline e cenário para um gestor. Seja objetivo e não invente números fora do texto abaixo.

${narrative}

Parâmetros auditáveis: removeItems=${scenario.audit.removeItems}, capacityMultiplier=${scenario.audit.capacityMultiplier}, nlMatches=${nlParts.join("; ") || "nenhum"}`,
      },
    ],
    options: { maxTokens: 400, temperature: 0.3 },
  });

  return NextResponse.json({
    ok: true,
    baseline: baseline.result,
    scenario: scenario.result,
    audit: {
      baseline: baseline.audit,
      scenario: scenario.audit,
      nlMatches: nlParts,
      narrative,
    },
    explanation: explainRes.ok ? (explainRes.assistantText ?? "").trim() : narrative,
    explainOk: explainRes.ok,
  });
}
