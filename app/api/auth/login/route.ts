import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createToken } from "@/lib/auth";
import { getUserByUsername, getUserByEmail, ensureAdminUser } from "@/lib/kv-users";

export async function POST(request: NextRequest) {
  try {
    await ensureAdminUser();
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: "Usuário e senha são obrigatórios" }, { status: 400 });
    }

    const ident = (username || "").trim();
    const user = ident.includes("@")
      ? await getUserByEmail(ident)
      : await getUserByUsername(ident);

    if (!user || !verifyPassword(password, user.passwordHash || "")) {
      return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }

    const isAdmin = user.id === "admin" || !!user.isAdmin;
    const token = createToken({ ...user, isAdmin });
    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
