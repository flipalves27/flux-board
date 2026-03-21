import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser, updateUser } from "@/lib/kv-users";
import { ProductTourPatchSchema, zodErrorToMessage } from "@/lib/schemas";

export async function PATCH(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const body = await request.json();
    const parsed = ProductTourPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const user = await updateUser(payload.id, payload.orgId, {
      boardProductTourCompleted: parsed.data.completed,
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      boardProductTourCompleted: !!user.boardProductTourCompleted,
    });
  } catch (err) {
    console.error("User product tour API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
