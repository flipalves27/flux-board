import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { removeTeamMember, upsertTeamMember } from "@/lib/kv-team-members";
import { normalizeTeamRole, type TeamRole } from "@/lib/rbac";
import { z } from "zod";

const TeamMemberRoleSchema = z
  .enum(["team_manager", "team_admin", "member", "guest"])
  .transform((r): TeamRole => normalizeTeamRole(r));

const PatchSchema = z.object({
  boardId: z.string().trim().max(200).optional(),
  role: TeamMemberRoleSchema.optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const body = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  const { userId } = await params;
  if (!body.data.role) return NextResponse.json({ error: "Informe role para atualização." }, { status: 400 });
  const member = await upsertTeamMember({
    orgId: payload.orgId,
    userId,
    boardId: body.data.boardId || undefined,
    role: body.data.role,
    active: body.data.active ?? true,
    updatedAt: new Date().toISOString(),
    updatedBy: payload.id,
  });
  return NextResponse.json({ member });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const { userId } = await params;
  const boardId = request.nextUrl.searchParams.get("boardId") || undefined;
  const ok = await removeTeamMember(payload.orgId, userId, boardId);
  if (!ok) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
