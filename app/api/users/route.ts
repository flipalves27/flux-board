import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listUsers, createUser, getUserByEmail, ensureAdminUser } from "@/lib/kv-users";
import { hashPassword } from "@/lib/auth";
import { sanitizeText, UserCreateSchema, zodErrorToMessage } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Acesso negado. Apenas administradores." }, { status: 403 });
  }

  try {
    await ensureAdminUser();
    const users = await listUsers();
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
  const payload = getAuthFromRequest(request);
  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Acesso negado. Apenas administradores." }, { status: 403 });
  }

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

    const user = await createUser({
      username: emailNorm,
      name,
      email: emailNorm,
      passwordHash: hashPassword(password),
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          isAdmin: false,
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
