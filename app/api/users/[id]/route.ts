import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getUserById, updateUser, ensureAdminUser, deleteUser } from "@/lib/kv-users";
import { hashPassword } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getAuthFromRequest(request);
  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Acesso negado. Apenas administradores." }, { status: 403 });
  }

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
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: !!user.isAdmin,
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
  const payload = getAuthFromRequest(request);
  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Acesso negado. Apenas administradores." }, { status: 403 });
  }

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
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = (body.name || "").trim();
    if (body.email !== undefined) updates.email = (body.email || "").trim().toLowerCase();
    if (body.password !== undefined && body.password.length >= 4) {
      updates.passwordHash = hashPassword(body.password);
    }

    const user = await updateUser(id, updates as Parameters<typeof updateUser>[1]);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        isAdmin: !!user.isAdmin,
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
  const payload = getAuthFromRequest(request);
  if (!payload || !payload.isAdmin) {
    return NextResponse.json({ error: "Acesso negado. Apenas administradores." }, { status: 403 });
  }

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
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("User API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
