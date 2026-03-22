import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoardIds,
  getBoardsByIds,
  createBoard,
  ensureBoardReborn,
  getDefaultBoardData,
  getBoardRebornId,
} from "@/lib/kv-boards";
import {
  computeBoardPortfolio,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import { ensureAdminUser } from "@/lib/kv-users";
import { BoardCreateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getBoardCap, planGateCtxForAuth } from "@/lib/plan-gates";
import { getPublishedTemplateById } from "@/lib/kv-templates";
import { createBoardFromTemplateSnapshot } from "@/lib/template-import";
import type { BoardTemplateSnapshot } from "@/lib/template-types";
import type { AutomationRule } from "@/lib/automation-types";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    await ensureBoardReborn(payload.orgId, org?.ownerId ?? payload.id, getDefaultBoardData);

    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const boardRows = await getBoardsByIds(boardIds, payload.orgId);
    const boards = boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      clientLabel: typeof b.clientLabel === "string" ? b.clientLabel : undefined,
      lastUpdated: b.lastUpdated,
      portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
    }));

    const rebornId = getBoardRebornId(payload.orgId);
    // Contagem de boards deve ser por organização (não apenas pelo usuário).
    const orgBoardIds = await getBoardIds(payload.id, payload.orgId, true);
    const currentCount = orgBoardIds.filter((id) => id !== rebornId).length;
    const cap = getBoardCap(org, planGateCtxForAuth(payload.isAdmin));
    const isPro = cap === null;

    const plan =
      {
        maxBoards: cap,
        isPro,
        currentCount,
        atLimit: cap !== null && currentCount >= cap,
      };
    return NextResponse.json({ boards, plan });
  } catch (err) {
    console.error("Boards API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    await ensureBoardReborn(payload.orgId, org?.ownerId ?? payload.id, getDefaultBoardData);

    const body = await request.json();
    const parsed = BoardCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const name = (sanitizeText(parsed.data.name ?? "Novo Board").trim().slice(0, 100) || "Novo Board").trim();
    const templateId = typeof parsed.data.templateId === "string" ? parsed.data.templateId.trim() : undefined;
    const rawSnap = parsed.data.templateSnapshot as BoardTemplateSnapshot | undefined;
    if (templateId && rawSnap) {
      return NextResponse.json({ error: "Use apenas templateId ou templateSnapshot, não ambos." }, { status: 400 });
    }

    const rebornId = getBoardRebornId(payload.orgId);
    const cap = getBoardCap(org, planGateCtxForAuth(payload.isAdmin));
    if (cap !== null) {
      const existingIds = await getBoardIds(payload.id, payload.orgId, true);
      const currentCount = existingIds.filter((id) => id !== rebornId).length;
      if (currentCount >= cap) {
        return NextResponse.json(
          { error: `Limite do plano: no máximo ${cap} board(s) por organização.` },
          { status: 403 }
        );
      }
    }

    let board;
    if (templateId) {
      const tpl = await getPublishedTemplateById(templateId);
      if (!tpl) {
        return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
      }
      const snap = tpl.snapshot;
      board = await createBoardFromTemplateSnapshot(payload.orgId, payload.id, name, {
        ...snap,
        automations: Array.isArray(snap.automations) ? (snap.automations as AutomationRule[]) : [],
      });
    } else if (rawSnap) {
      board = await createBoardFromTemplateSnapshot(payload.orgId, payload.id, name, {
        ...rawSnap,
        automations: Array.isArray(rawSnap.automations) ? (rawSnap.automations as AutomationRule[]) : [],
      });
    } else {
      board = await createBoard(payload.orgId, payload.id, name, {
        version: "2.0",
        cards: [],
        config: { bucketOrder: [], collapsedColumns: [] },
        mapaProducao: [],
        dailyInsights: [],
      });
    }
    return NextResponse.json(
      {
        board: {
          id: board.id,
          name: board.name,
          ownerId: board.ownerId,
          lastUpdated: board.lastUpdated,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Boards API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
