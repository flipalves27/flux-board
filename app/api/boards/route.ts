import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoardListRowsByIds, createBoard, countBoardsInOrg } from "@/lib/kv-boards";
import {
  computeBoardPortfolio,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import { publicApiErrorResponse } from "@/lib/public-api-error";
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
import { ensureOrgBoardsHaveDefaultProject, getProject, listProjects } from "@/lib/kv-projects";

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
    const requestedProjectId = request.nextUrl.searchParams.get("projectId")?.trim() || undefined;
    await ensureOrgBoardsHaveDefaultProject(payload.orgId);

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
    const boardRows = await getBoardListRowsByIds(boardIds, payload.orgId, { projectId: requestedProjectId });
    logFluxApiPhase(route, "getBoardListRowsByIds", t3);
    const projects = await listProjects(payload.orgId);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const boards = boardRows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      projectId: b.projectId ?? null,
      projectName: b.projectId ? projectById.get(b.projectId)?.name ?? null : null,
      clientLabel: typeof b.clientLabel === "string" ? b.clientLabel : undefined,
      lastUpdated: b.lastUpdated,
      boardMethodology: b.boardMethodology,
      portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
    }));

    // Contagem alinhada a documentos `boards` com este orgId (limite de plano / billing).
    const t4 = Date.now();
    const currentCount = await countBoardsInOrg(payload.orgId);
    logFluxApiPhase(route, "countBoardsInOrg", t4);
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
    console.error("Boards API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/route.ts" });
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
      const currentCount = await countBoardsInOrg(payload.orgId);
      if (currentCount >= cap) {
        return NextResponse.json(
          { error: `Limite do plano: no máximo ${cap} board(s) por organização.` },
          { status: 403 }
        );
      }
    }

    const methodology = parsed.data.boardMethodology;
    const requestedProjectId = parsed.data.projectId?.trim();
    const project = requestedProjectId
      ? await getProject(payload.orgId, requestedProjectId)
      : (await ensureOrgBoardsHaveDefaultProject(payload.orgId)).project;
    if (!project || project.archivedAt) {
      return NextResponse.json({ error: "Projeto não encontrado ou arquivado." }, { status: 404 });
    }
    const projectId = project.id;
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
      }, { projectId });
    } else if (rawSnap) {
      board = await createBoardFromTemplateSnapshot(payload.orgId, payload.id, name, {
        ...rawSnap,
        boardMethodology: rawSnap.boardMethodology ?? methodology,
        automations: Array.isArray(rawSnap.automations) ? (rawSnap.automations as AutomationRule[]) : [],
      }, { projectId });
    } else {
      board = await createBoard(payload.orgId, payload.id, name, {
        ...initialBoardPayloadForMethodology(methodology),
        projectId,
      });
    }
    return NextResponse.json(
      {
        board: {
          id: board.id,
          name: board.name,
          ownerId: board.ownerId,
          projectId: board.projectId ?? projectId,
          projectName: project.name,
          lastUpdated: board.lastUpdated,
          boardMethodology: board.boardMethodology ?? methodology,
        },
      },
      { status: 201, headers: corsHeaders(request) }
    );
  } catch (err) {
    console.error("Boards API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/route.ts" });
  }
}
