import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { listUsers } from "@/lib/kv-users";
import { listBoardsForUser } from "@/lib/kv-boards";
import { describeDowngradeImpact } from "@/lib/plan-gates";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const org = await getOrganizationById(payload.orgId);
    if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

    const users = await listUsers(payload.orgId);
    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);

    const impact = describeDowngradeImpact({
      boardsCount: boards.length,
      usersCount: users.length,
    });

    return NextResponse.json({
      org: {
        plan: org.plan,
        downgradeGraceEndsAt: org.downgradeGraceEndsAt ?? null,
        downgradeFromTier: org.downgradeFromTier ?? null,
      },
      impact,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 }
    );
  }
}
