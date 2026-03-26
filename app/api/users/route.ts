import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listUsers, createUser, getUserByEmail, ensureAdminUser } from "@/lib/kv-users";
import { hashPassword } from "@/lib/auth";
import { sanitizeText, UserCreateSchema, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getUserCap, planGateCtxForAuth } from "@/lib/plan-gates";
import { ensureOrgManager } from "@/lib/api-authz";
import { isPlatformAdmin } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  try {
    await ensureAdminUser();
    const targetOrgId = isPlatformAdmin(payload)
      ? request.nextUrl.searchParams.get("orgId") || payload.orgId
      : payload.orgId;
    const users = await listUsers(targetOrgId);
    return NextResponse.json({ users });
  } catch (err) {
    console.error("Users API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  try {
    await ensureAdminUser();
    const body = await request.json();
    const parsed = UserCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const name = sanitizeText(parsed.data.name).trim();
    const emailNorm = sanitizeText(parsed.data.email).trim().toLowerCase();
    const password = parsed.data.password;

    if (!name || !emailNorm || !password) {
      return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios" }, { status: 400 });
    }

    if (await getUserByEmail(emailNorm)) {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
    }

    const targetOrgId = isPlatformAdmin(payload)
      ? request.nextUrl.searchParams.get("orgId") || payload.orgId
      : payload.orgId;
    const org = await getOrganizationById(targetOrgId);
    const members = await listUsers(targetOrgId);
    const cap = getUserCap(org, planGateCtxForAuth(payload.isAdmin, payload.isExecutive));
    if (cap !== null && members.length >= cap) {
      return NextResponse.json(
        { error: `Limite do plano: no máximo ${cap} usuário(s) por organização.` },
        { status: 403 }
      );
    }

    const wantAdmin = !!parsed.data.isAdmin;
    const user = await createUser({
      username: emailNorm,
      name,
      email: emailNorm,
      passwordHash: hashPassword(password),
      orgId: targetOrgId,
      ...(wantAdmin ? { isAdmin: true } : {}),
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          isAdmin: !!user.isAdmin,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Users API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
