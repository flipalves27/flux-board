import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { upsertStandupEntry, listStandupEntries } from "@/lib/kv-standup";
import { sanitizeText } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "ceremonies", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const entries = await listStandupEntries(payload.orgId, boardId, date);
  return NextResponse.json({ entries, date });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtxPost = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "ceremonies", gateCtxPost); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { didYesterday, willToday, blockers, date } = body as Record<string, string>;
  if (!didYesterday?.trim() && !willToday?.trim()) {
    return NextResponse.json({ error: "Preencha ao menos um campo." }, { status: 400 });
  }

  const entry = await upsertStandupEntry({
    orgId: payload.orgId,
    boardId,
    userId: payload.id,
    userName: payload.username || "Usuário",
    date: String(date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    didYesterday: String(didYesterday ?? "").trim().slice(0, 800),
    willToday: String(willToday ?? "").trim().slice(0, 800),
    blockers: String(blockers ?? "").trim().slice(0, 500),
  });
  return NextResponse.json({ entry }, { status: 201 });
}
