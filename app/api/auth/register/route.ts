import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createToken } from "@/lib/auth";
import { getUserByEmail, createUser, ensureAdminUser } from "@/lib/kv-users";

export async function POST(request: NextRequest) {
  try {
    await ensureAdminUser();
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios" }, { status: 400 });
    }

    const emailNorm = (email || "").trim().toLowerCase();
    const nameTrim = (name || "").trim().slice(0, 100);

    if (password.length < 4) {
      return NextResponse.json(
        { error: "Senha deve ter pelo menos 4 caracteres" },
        { status: 400 }
      );
    }

    if (await getUserByEmail(emailNorm)) {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 });
    }

    const user = await createUser({
      username: emailNorm,
      name: nameTrim || emailNorm,
      email: emailNorm,
      passwordHash: hashPassword(password),
    });

    const token = createToken(user);
    return NextResponse.json(
      {
        token,
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
    console.error("Register error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
