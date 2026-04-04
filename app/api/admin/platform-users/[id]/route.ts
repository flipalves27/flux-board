import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { ensureAdminUser, getUserRecordById } from "@/lib/kv-users";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
  }

  try {
    await ensureAdminUser();
    const user = await getUserRecordById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        orgId: user.orgId,
        orgRole: user.orgRole,
        platformRole: user.platformRole,
        isAdmin: !!user.isAdmin,
        ...(user.isExecutive ? { isExecutive: true } : {}),
      },
    });
  } catch (err) {
    console.error("platform-users [id] GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
