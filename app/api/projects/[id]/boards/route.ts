import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  getBoard,
  getBoardIds,
  getBoardListRowsByIds,
  updateBoard,
  userCanAccessExistingBoard,
} from "@/lib/kv-boards";
import { getProject } from "@/lib/kv-projects";
import { ProjectBoardLinkSchema, zodErrorToMessage } from "@/lib/schemas";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { deriveEffectiveRoles, isOrgConvidado, isPlatformAdmin } from "@/lib/rbac";
import { publicApiErrorResponse } from "@/lib/public-api-error";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const project = await getProject(payload.orgId, id);
    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const rows = await getBoardListRowsByIds(boardIds, payload.orgId, { projectId: id });
    const boards = rows.map((b) => ({
      id: b.id,
      name: b.name,
      ownerId: b.ownerId,
      projectId: b.projectId ?? null,
      clientLabel: b.clientLabel,
      lastUpdated: b.lastUpdated,
      boardMethodology: b.boardMethodology,
      portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
    }));
    return NextResponse.json({ project, boards });
  } catch (err) {
    console.error("Project boards API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/boards/route.ts" });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const roleCtx = deriveEffectiveRoles(payload);
    if (isOrgConvidado(roleCtx) && !isPlatformAdmin(roleCtx)) {
      return NextResponse.json({ error: "Convidados não podem mover boards entre projetos." }, { status: 403 });
    }

    const { id } = await params;
    const project = await getProject(payload.orgId, id);
    if (!project || project.archivedAt) {
      return NextResponse.json({ error: "Projeto não encontrado ou arquivado." }, { status: 404 });
    }
    const body = await request.json();
    const parsed = ProjectBoardLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const board = await getBoard(parsed.data.boardId, payload.orgId);
    if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
    const canAccess = await userCanAccessExistingBoard(board, payload.id, payload.orgId, payload.isAdmin);
    if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board." }, { status: 403 });
    const updated = await updateBoard(
      board.id,
      payload.orgId,
      { projectId: project.id },
      { userId: payload.id, userName: payload.username, orgId: payload.orgId }
    );
    return NextResponse.json({ board: updated, project });
  } catch (err) {
    console.error("Project boards API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/boards/route.ts" });
  }
}
