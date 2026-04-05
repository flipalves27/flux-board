import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoardListRowsByIds, createBoard } from "@/lib/kv-boards";
import {
  computeBoardPortfolio,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import { ensureAdminUser } from "@/lib/kv-users";
import { deriveEffectiveRoles, isOrgConvidado, isPlatformAdmin } from "@/lib/rbac";
import { BoardCreateSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getBoardCap, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { getPublishedTemplateById } from "@/lib/kv-templates";
import { createBoardFromTemplateSnapshot } from "@/lib/template-import";
import type { BoardTemplateSnapshot } from "@/lib/template-types";
import type { AutomationRule } from "@/lib/automation-types";
import { boardsApiCorsHeaders } from "@/lib/cors-allowlist";
import { initialBoardPayloadForMethodology } from "@/lib/board-methodology";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";

export const maxDuration = 60;

function corsHeaders(request: NextRequest) {
  return boardsApiCorsHeaders(request);
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const route = "GET /api/boards";
  const t0 = Date.now();
  const payload = await getAuthFromRequest(request);
  logFluxApiPhase(route, "getAuthFromRequest", t0);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const t1 = Date.now();
    const org = await getOrganizationById(payload.orgId);
    logFluxApiPhase(route, "getOrganizationById", t1);

    const t2 = Date.now();
    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    logFluxApiPhase(route, "getBoardIds(userView)", t2);
    if (
      process.env.FLUX_LOG_EMPTY_BOARD_LIST === "1" &&
      boardIds.length === 0 &&
      !payload.isAdmin
    ) {
      console.warn("[api/boards] empty board list for non-admin", {
        orgId: payload.orgId,
        userId: payload.id,
      });
    }

    const t3 = Date.now();
    const boardRows = await getBoardListRowsByIds(boardIds, payload.orgId);
    logFluxApiPhase(route, "getBoardListRowsByIds", t3);
    const boards = boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      clientLabel: typeof b.clientLabel === "string" ? b.clientLabel : undefined,
      lastUpdated: b.lastUpdated,
      boardMethodology: b.boardMethodology,
      portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
    }));

    // Contagem de boards deve ser por organização (não apenas pelo usuário).
    // Otimização: se o utilizador não é admin, usa a contagem dos seus boards (mais rápido).
    const t4 = Date.now();
    const orgBoardIds = payload.isAdmin ? await getBoardIds(payload.id, payload.orgId, true) : boardIds;
    logFluxApiPhase(route, `getBoardIds(orgCount)${!payload.isAdmin ? "-optimized" : ""}`, t4);
    const currentCount = orgBoardIds.length;
    const cap = getBoardCap(org, planGateCtxFromAuthPayload(payload));
    const isPro = cap === null;

    const plan =
      {
        maxBoards: cap,
        isPro,
        currentCount,
        atLimit: cap !== null && currentCount >= cap,
      };
    logFluxApiPhase(route, "total", t0);
    return NextResponse.json({ boards, plan }, { headers: corsHeaders(request) });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error("[api/boards] erro após", elapsed, "ms:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);

    const roleCtx = deriveEffectiveRoles(payload);
    if (isOrgConvidado(roleCtx) && !isPlatformAdmin(roleCtx)) {
      return NextResponse.json({ error: "Convidados não podem criar boards." }, { status: 403 });
    }

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

    const cap = getBoardCap(org, planGateCtxFromAuthPayload(payload));
    if (cap !== null) {
      const existingIds = await getBoardIds(payload.id, payload.orgId, true);
      const currentCount = existingIds.length;
      if (currentCount >= cap) {
        return NextResponse.json(
          { error: `Limite do plano: no máximo ${cap} board(s) por organização.` },
          { status: 403 }
        );
      }
    }

    const methodology = parsed.data.boardMethodology;
    let board;
    if (templateId) {
      const tpl = await getPublishedTemplateById(templateId);
      if (!tpl) {
        return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
      }
      const snap = tpl.snapshot;
      board = await createBoardFromTemplateSnapshot(payload.orgId, payload.id, name, {
        ...snap,
        boardMethodology: snap.boardMethodology ?? methodology,
        automations: Array.isArray(snap.automations) ? (snap.automations as AutomationRule[]) : [],
      });
    } else if (rawSnap) {
      board = await createBoardFromTemplateSnapshot(payload.orgId, payload.id, name, {
        ...rawSnap,
        boardMethodology: rawSnap.boardMethodology ?? methodology,
        automations: Array.isArray(rawSnap.automations) ? (rawSnap.automations as AutomationRule[]) : [],
      });
    } else {
      board = await createBoard(payload.orgId, payload.id, name, initialBoardPayloadForMethodology(methodology));
    }
    return NextResponse.json(
      {
        board: {
          id: board.id,
          name: board.name,
          ownerId: board.ownerId,
          lastUpdated: board.lastUpdated,
          boardMethodology: board.boardMethodology ?? methodology,
        },
      },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch (err) {
    console.error("Boards API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
