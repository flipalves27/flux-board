import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  createOrganizationInvite,
  listOrganizationInvites,
  normalizeInviteAssignedOrgRole,
} from "@/lib/kv-organization-invites";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { ensureOrgManager } from "@/lib/api-authz";
import { assignableInviteOrgRoles, deriveEffectiveRoles, isAssignableInviteOrgRole } from "@/lib/rbac";
import { getUserById } from "@/lib/kv-users";
export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

  const rawRole = typeof body?.orgRole === "string" ? body.orgRole.trim() : "membro";
  const assignedOrgRole = normalizeInviteAssignedOrgRole(rawRole);
  const inviterRoles = deriveEffectiveRoles(payload);
  if (!isAssignableInviteOrgRole(inviterRoles, assignedOrgRole)) {
    return NextResponse.json(
      { error: "Papel inválido: só pode convidar níveis abaixo do seu na organização." },
      { status: 400 }
    );
  }

  try {
    const inv = await createOrganizationInvite({
      orgId: payload.orgId,
      email,
      assignedOrgRole,
    });
    return NextResponse.json({
      invite: {
        code: inv._id,
        emailLower: inv.emailLower,
        expiresAt: inv.expiresAt,
        assignedOrgRole: inv.assignedOrgRole,
      },
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/organization-invites/route.ts", status: 400, fallbackMessage: "Pedido inválido. Tente novamente." });
  }
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const invites = await listOrganizationInvites(payload.orgId);
  const assignableRoles = assignableInviteOrgRoles(deriveEffectiveRoles(payload));
  const enriched = await Promise.all(
    invites.map(async (i) => {
      let usedByName: string | null = null;
      let usedByEmail: string | null = null;
      if (i.usedByUserId) {
        const u = await getUserById(i.usedByUserId, payload.orgId);
        if (u) {
          usedByName = u.name;
          usedByEmail = u.email;
        }
      }
      return {
        ...i,
        assignedOrgRole: normalizeInviteAssignedOrgRole(i.assignedOrgRole),
        usedByName,
        usedByEmail,
      };
    })
  );
  return NextResponse.json({
    invites: enriched,
    assignableRoles,
  });
}
