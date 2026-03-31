import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getBoardAutomationRules } from "@/lib/kv-automations";
import { appendAutomationExecutionLog, listAutomationExecutionLogs } from "@/lib/kv-automation-logs";

const SimulateSchema = z.object({
  ruleId: z.string().trim().min(1),
  cardId: z.string().trim().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });

  const logs = await listAutomationExecutionLogs({ boardId, orgId: payload.orgId });
  return NextResponse.json({ logs });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = SimulateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const rules = await getBoardAutomationRules(boardId, payload.orgId);
  const rule = rules.find((r) => r.id === parsed.data.ruleId);
  if (!rule) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });

  await appendAutomationExecutionLog({
    orgId: payload.orgId,
    boardId,
    ruleId: rule.id,
    triggerType: rule.trigger.type,
    actionType: rule.action.type,
    cardId: parsed.data.cardId ?? null,
    status: "simulated",
    message: "Manual test rule execution.",
  });

  return NextResponse.json({ ok: true });
}

