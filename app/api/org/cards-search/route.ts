import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { listBoardsForUser } from "@/lib/kv-boards";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    assertFeatureAllowed(org, "portfolio_export", planGateCtxFromAuthPayload(payload));

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const excludeBoardId = searchParams.get("excludeBoardId") || "";
    const limit = Math.min(40, Math.max(1, Number(searchParams.get("limit") || "24") || 24));

    if (q.length < 2) {
      return NextResponse.json({ schema: "flux-board.cards_search.v1", results: [] });
    }

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const results: Array<{ boardId: string; boardName: string; cardId: string; title: string }> = [];

    for (const b of boards) {
      if (excludeBoardId && b.id === excludeBoardId) continue;
      const cards = Array.isArray(b.cards) ? b.cards : [];
      for (const raw of cards) {
        const c = raw as { id?: string; title?: string; progress?: string };
        if (!c.id || String(c.progress || "") === "Concluída") continue;
        const title = String(c.title || "");
        if (!title.toLowerCase().includes(q)) continue;
        results.push({
          boardId: b.id,
          boardName: String(b.name || b.id),
          cardId: c.id,
          title,
        });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return NextResponse.json({ schema: "flux-board.cards_search.v1", results });
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    console.error("cards-search GET:", err);
    return NextResponse.json({ error: "Erro na busca." }, { status: 500 });
  }
}
