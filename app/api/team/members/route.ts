import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";
import { listTeamMembers, upsertTeamMember } from "@/lib/kv-team-members";
import { normalizeTeamRole, type TeamRole } from "@/lib/rbac";
import { z } from "zod";

const TeamMemberRoleSchema = z
  .enum(["team_manager", "team_admin", "member", "guest"])
  .transform((r): TeamRole => normalizeTeamRole(r));

const BodySchema = z.object({
  userId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().max(200).optional(),
  role: TeamMemberRoleSchema,
  active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const boardId = request.nextUrl.searchParams.get("boardId") || undefined;
  const members = await listTeamMembers(payload.orgId, boardId);
  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  const member = await upsertTeamMember({
    orgId: payload.orgId,
    userId: body.data.userId,
    boardId: body.data.boardId || undefined,
    role: body.data.role,
    active: body.data.active ?? true,
    updatedAt: new Date().toISOString(),
    updatedBy: payload.id,
  });
  return NextResponse.json({ member }, { status: 201 });
}
