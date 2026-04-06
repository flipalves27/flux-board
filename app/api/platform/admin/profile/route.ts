import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, hashPassword, verifyPassword } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { getUserById, updateUser } from "@/lib/kv-users";
import { sanitizeText, PlatformAdminProfilePatchSchema, zodErrorToMessage } from "@/lib/schemas";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export const runtime = "nodejs";

/** Perfil do próprio admin da plataforma (senha, nome, e-mail). */
export async function PATCH(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PlatformAdminProfilePatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const clean = parsed.data;
    if (clean.name === undefined && clean.email === undefined && !clean.newPassword) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const user = await getUserById(payload.id, payload.orgId);
    if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (clean.newPassword && clean.newPassword.length > 0) {
      if (!user.passwordHash) {
        return NextResponse.json(
          { error: "Conta sem senha local (OAuth). Não é possível alterar senha aqui." },
          { status: 400 }
        );
      }
      if (!clean.currentPassword || !verifyPassword(clean.currentPassword, user.passwordHash)) {
        return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
      }
    }

    const updates: Parameters<typeof updateUser>[2] = {};
    if (clean.name !== undefined) {
      const name = sanitizeText(clean.name).trim();
      if (!name) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
      updates.name = name;
    }
    if (clean.email !== undefined) {
      const email = sanitizeText(clean.email).trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
      updates.email = email;
    }
    if (clean.newPassword && clean.newPassword.length > 0) {
      updates.passwordHash = hashPassword(clean.newPassword);
    }

    const next = await updateUser(payload.id, payload.orgId, updates);
    if (!next) return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      user: {
        id: next.id,
        username: next.username,
        name: next.name,
        email: next.email,
      },
    });
  } catch (err) {
    console.error("[platform admin profile]", err);
    return publicApiErrorResponse(err, { context: "api/platform/admin/profile/route.ts" });
  }
}
