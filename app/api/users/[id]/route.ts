import { NextRequest, NextResponse } from "next/server";
import {
  getUserById,
  updateUser,
  ensureAdminUser,
  deleteUser,
  getUserRecordById,
  getUserByEmail,
  moveUserToOrganization,
} from "@/lib/kv-users";
import { getAuthFromRequest, hashPassword } from "@/lib/auth";
import { sanitizeText, UserUpdateSchema, zodErrorToMessage } from "@/lib/schemas";
import { ensureOrgManager, ensureOrgTeamManager } from "@/lib/api-authz";
import { deriveEffectiveRoles, isPlatformAdmin } from "@/lib/rbac";
import { insertAuditEvent } from "@/lib/audit-events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgTeamManager(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id || id === "users") {
    return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
  }

  const rolesGet = deriveEffectiveRoles(payload);
  if (id === "admin" && payload.id !== "admin" && !isPlatformAdmin(rolesGet)) {
    return NextResponse.json(
      { error: "Apenas o administrador da plataforma pode consultar este utilizador." },
      { status: 403 }
    );
  }

  try {
    await ensureAdminUser();
    const targetOrgId = isPlatformAdmin(rolesGet)
      ? request.nextUrl.searchParams.get("orgId") || payload.orgId
      : payload.orgId;
    const user = isPlatformAdmin(rolesGet)
      ? await getUserRecordById(id)
      : await getUserById(id, targetOrgId);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        orgRole: user.orgRole,
        platformRole: user.platformRole,
        isAdmin: !!user.isAdmin,
        ...(user.isExecutive ? { isExecutive: true } : {}),
      },
    });
  } catch (err) {
    console.error("User API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id || id === "users") {
    return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
  }

  const roles = deriveEffectiveRoles(payload);
  if (id === "admin" && payload.id !== "admin" && !isPlatformAdmin(roles)) {
    return NextResponse.json(
      { error: "Apenas o administrador da plataforma pode alterar este utilizador." },
      { status: 403 }
    );
  }

  try {
    await ensureAdminUser();
    const body = await request.json();
    const parsed = UserUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const clean = parsed.data;
    let existingUser = isPlatformAdmin(roles)
      ? await getUserRecordById(id)
      : await getUserById(id, payload.orgId);
    if (!existingUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    let targetOrgId = existingUser.orgId;

    if (clean.orgId !== undefined) {
      if (!isPlatformAdmin(roles)) {
        return NextResponse.json(
          { error: "Apenas administrador da plataforma pode alterar a organização do utilizador." },
          { status: 403 }
        );
      }
      const nextOrg = clean.orgId.trim();
      if (nextOrg && nextOrg !== existingUser.orgId) {
        const previousOrgId = existingUser.orgId;
        const moved = await moveUserToOrganization(id, nextOrg);
        if (!moved) {
          return NextResponse.json({ error: "Organização inválida ou falha ao mover utilizador." }, { status: 400 });
        }
        existingUser = moved;
        targetOrgId = moved.orgId;
        await insertAuditEvent({
          action: "user.org_moved",
          resourceType: "user",
          actorUserId: payload.id,
          resourceId: id,
          orgId: targetOrgId,
          metadata: { previousOrgId, newOrgId: moved.orgId },
        });
      }
    }

    const updates: Record<string, unknown> = {};
    if (clean.name !== undefined) {
      const name = sanitizeText(clean.name).trim();
      if (!name) return NextResponse.json({ error: "Nome invalido." }, { status: 400 });
      updates.name = name;
    }
    if (clean.email !== undefined) {
      const email = sanitizeText(clean.email).trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "E-mail invalido." }, { status: 400 });
      const other = await getUserByEmail(email);
      if (other && other.id !== id) {
        return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
      }
      updates.email = email;
    }
    if (clean.password !== undefined) {
      updates.passwordHash = hashPassword(clean.password);
    }
    if (clean.platformRole !== undefined) {
      if (!isPlatformAdmin(roles)) {
        return NextResponse.json({ error: "Apenas administrador da plataforma pode alterar platformRole." }, { status: 403 });
      }
      updates.platformRole = clean.platformRole;
    }
    if (id !== "admin") {
      if (clean.orgRole !== undefined) {
        updates.orgRole = clean.orgRole;
      }
      if (clean.isAdmin !== undefined) {
        updates.isAdmin = clean.isAdmin;
        if (clean.orgRole === undefined) {
          updates.orgRole = clean.isAdmin ? "gestor" : "membro";
        }
      }
      if (clean.isExecutive !== undefined) {
        updates.isExecutive = clean.isExecutive;
        if (clean.orgRole === undefined && clean.isExecutive) {
          updates.orgRole = "gestor";
        }
      }
    }

    const user = await updateUser(id, targetOrgId, updates as Parameters<typeof updateUser>[2]);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        orgRole: user.orgRole,
        platformRole: user.platformRole,
        isAdmin: !!user.isAdmin,
        ...(user.isExecutive ? { isExecutive: true } : {}),
      },
    });
  } catch (err) {
    console.error("User API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id || id === "users") {
    return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
  }

  if (id === "admin") {
    return NextResponse.json(
      { error: "O usuário Admin não pode ser alterado ou excluído" },
      { status: 400 }
    );
  }

  try {
    await ensureAdminUser();
    const rolesDel = deriveEffectiveRoles(payload);
    if (isPlatformAdmin(rolesDel)) {
      const u = await getUserRecordById(id);
      if (!u) {
        return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
      }
      await deleteUser(id, u.orgId);
    } else {
      const user = await getUserById(id, payload.orgId);
      if (!user) {
        return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
      }
      await deleteUser(id, payload.orgId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("User API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
