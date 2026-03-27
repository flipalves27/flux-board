import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { upsertBoardMember, getBoardEffectiveRole, roleCanAdmin, type BoardRole } from "@/lib/kv-board-members";
import { listUsers } from "@/lib/kv-users";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const AddMemberSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1).max(200),
  role: z.enum(["viewer", "editor", "admin"]),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  /** Usuários da organização (assignee, cerimônias). Board-level RBAC fica em POST/delete; sem convites explícitos o board é “aberto” à org. */
  const orgUsers = await listUsers(payload.orgId);
  const members = orgUsers.map((u) => ({
    userId: u.id,
    username: u.username,
    name: u.name,
  }));
  return NextResponse.json({ members });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const effectiveRole = await getBoardEffectiveRole(payload.orgId, boardId, payload.id, board.ownerId === payload.id, payload.isAdmin);
  if (!roleCanAdmin(effectiveRole)) {
    return NextResponse.json({ error: "Apenas administradores do board podem gerenciar membros." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const member = await upsertBoardMember({
    boardId,
    orgId: payload.orgId,
    userId: parsed.data.userId,
    username: parsed.data.username,
    role: parsed.data.role as BoardRole,
    invitedBy: payload.id,
    addedAt: new Date().toISOString(),
  });

  return NextResponse.json({ member }, { status: 201 });
}
