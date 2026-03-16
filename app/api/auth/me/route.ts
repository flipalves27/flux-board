import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getUserById, ensureAdminUser } from "@/lib/kv-users";

export async function GET(request: NextRequest) {
  try {
    await ensureAdminUser();
    const payload = getAuthFromRequest(request);
    if (!payload) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const user = await getUserById(payload.id);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 401 });
    }

    const isAdmin = user.id === "admin" || !!user.isAdmin;
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin,
      },
    });
  } catch (err) {
    console.error("Me error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
