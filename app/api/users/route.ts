import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listUsers, createUser, getUserByEmail, ensureAdminUser } from "@/lib/kv-users";
import { hashPassword } from "@/lib/auth";

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
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const emailNorm = (email || "").trim().toLowerCase();
    if (await getUserByEmail(emailNorm)) {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
    }

    const user = await createUser({
      username: emailNorm,
      name: (name || "").trim(),
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
