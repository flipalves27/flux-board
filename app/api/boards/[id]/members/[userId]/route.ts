import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import {
  getBoardMember,
  upsertBoardMember,
  removeBoardMember,
  getBoardEffectiveRole,
  roleCanAdmin,
  type BoardRole,
} from "@/lib/kv-board-members";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

const UpdateRoleSchema = z.object({ role: z.enum(["viewer", "editor", "admin"]) });

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, userId: targetUserId } = await params;
  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const effectiveRole = await getBoardEffectiveRole(payload.orgId, boardId, payload.id, board.ownerId === payload.id, payload.isAdmin);
  if (!roleCanAdmin(effectiveRole)) {
    return NextResponse.json({ error: "Apenas administradores do board podem alterar papéis." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = UpdateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Role inválida", details: parsed.error.flatten() }, { status: 422 });
  }

  const existing = await getBoardMember(payload.orgId, boardId, targetUserId);
  if (!existing) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });

  const updated = await upsertBoardMember({ ...existing, role: parsed.data.role as BoardRole });
  return NextResponse.json({ member: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, userId: targetUserId } = await params;
  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const effectiveRole = await getBoardEffectiveRole(payload.orgId, boardId, payload.id, board.ownerId === payload.id, payload.isAdmin);
  const isSelf = targetUserId === payload.id;

  if (!roleCanAdmin(effectiveRole) && !isSelf) {
    return NextResponse.json({ error: "Apenas administradores do board podem remover membros." }, { status: 403 });
  }

  const removed = await removeBoardMember(payload.orgId, boardId, targetUserId);
  if (!removed) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
