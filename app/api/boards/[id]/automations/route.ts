import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getBoardAutomationRules, setBoardAutomationRules } from "@/lib/kv-automations";
import { AutomationRulesUpsertSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const rules = await getBoardAutomationRules(boardId, payload.orgId);
    return NextResponse.json({ rules });
  } catch (err) {
    console.error("Automations GET error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/automations/route.ts" });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = AutomationRulesUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const clean = sanitizeDeep(parsed.data);
    await setBoardAutomationRules(boardId, payload.orgId, clean.rules);
    return NextResponse.json({ ok: true, rules: clean.rules });
  } catch (err) {
    console.error("Automations PUT error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/automations/route.ts" });
  }
}
