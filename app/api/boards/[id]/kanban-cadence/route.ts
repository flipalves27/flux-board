import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
} from "@/lib/plan-gates";
import { generateKanbanCadence, type KanbanCadenceType } from "@/lib/ceremony-kanban-cadence";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const RequestSchema = z.object({
  type: z.enum(["service_delivery_review", "replenishment", "flow_review", "retro_de_fluxo"]),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "ceremonies", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({ key: makeDailyAiCallsRateLimitKey(payload.orgId), limit: dailyCap, windowMs: getDailyAiCallsWindowMs() });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Tipo de cerimônia inválido. Use: service_delivery_review, replenishment, flow_review, retro_de_fluxo" }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const result = await generateKanbanCadence({ board, org, type: parsed.data.type as KanbanCadenceType });
  return NextResponse.json({ cadence: result });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const availableTypes: Array<{ type: KanbanCadenceType; label: string; description: string }> = [
    { type: "service_delivery_review", label: "Service Delivery Review", description: "Avalia entrega de valor ao cliente e SLAs" },
    { type: "replenishment", label: "Reunião de Reposição", description: "Prioriza e seleciona trabalho para o backlog" },
    { type: "flow_review", label: "Revisão de Fluxo", description: "Analisa saúde do fluxo e impedimentos sistêmicos" },
    { type: "retro_de_fluxo", label: "Retrospectiva de Fluxo", description: "Reflexão sobre o processo Kanban e melhorias" },
  ];

  return NextResponse.json({ availableTypes });
}
